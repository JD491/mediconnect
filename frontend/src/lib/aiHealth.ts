/**
 * aiHealth.ts — the single front-end gateway for MediConnect's AI features.
 *
 * Every request goes through the `gemini-health` Edge Function. When that
 * function is unavailable (no Gemini key configured, offline demo, network
 * blip) we fall back to a deterministic, evidence-aligned rules engine built
 * on `symptomEngine.ts`. The shape of the answer is identical either way, so
 * the UI never needs to know which source produced it.
 *
 * This is educational guidance, never a diagnosis or prescription.
 */
import { analyzeSymptoms, SYMPTOM_LIST, type Severity } from './symptomEngine';
import { supabase } from './supabaseClient';

export type AiLanguage = 'en' | 'hi' | 'mr';
export type Urgency = 'self_care' | 'routine' | 'urgent' | 'emergency';
export type AiMode = 'chat' | 'triage';

export interface AiHealthAnswer {
  source: 'gemini' | 'local';
  mode: AiMode;
  language: AiLanguage;
  urgency: Urgency;
  headline: string;
  reply: string;
  conditions: string[];
  redFlags: string[];
  specialist: string;
  followUpQuestions: string[];
  selfCare: string[];
  actions: string[];
  disclaimer: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TriageContext {
  symptoms: string[];
  duration?: 'today' | 'days' | 'week' | 'longer';
  severity?: 'mild' | 'moderate' | 'severe';
  redFlags?: string[];
  ageGroup?: 'child' | 'adult' | 'senior';
  notes?: string;
  existingConditions?: string;
}

export const AI_LANGUAGES: { id: AiLanguage; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'hi', label: 'Hindi', native: 'हिंदी' },
  { id: 'mr', label: 'Marathi', native: 'मराठी' },
];

const URGENCY_RANK: Record<Urgency, number> = { self_care: 0, routine: 1, urgent: 2, emergency: 3 };

export const URGENCY_STYLE: Record<Urgency, string> = {
  self_care: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  routine: 'bg-sky-100 text-sky-700 border-sky-200',
  urgent: 'bg-amber-100 text-amber-700 border-amber-200',
  emergency: 'bg-rose-100 text-rose-700 border-rose-200',
};

type Copy = {
  labels: Record<Urgency, string>;
  disclaimer: string;
  emergencyCta: string;
  book: string;
  symptomChecker: string;
  ask: string;
  sourceAi: string;
  sourceLocal: string;
  greeting: string;
  placeholder: string;
  send: string;
  thinking: string;
  listening: string;
  voice: string;
  reset: string;
  close: string;
  open: string;
  title: string;
  subtitle: string;
  quick: string[];
  followUps: string[];
  selfCare: string;
  redFlags: string;
  conditions: string;
  urgentNote: string;
  notMedicalAdvice: string;
  noMatch: string;
  worsened: string;
  emergencyReply: string;
  generalReply: string;
  medicineReply: string;
  bookingReply: string;
  durationToday: string;
  durationDays: string;
  durationWeek: string;
  durationLonger: string;
  severityMild: string;
  severityModerate: string;
  severitySevere: string;
  redFlagQuestion: string;
  redFlagNone: string;
  redFlagChest: string;
  redFlagBreathing: string;
  redFlagBleeding: string;
  redFlagFainting: string;
  child: string;
  adult: string;
  senior: string;
  ageQuestion: string;
  feelingQuestion: string;
  durationQuestion: string;
  severityQuestion: string;
  notesQuestion: string;
  howItWorksTitle: string;
  howItWorksBody: string;
  doctorQuestions: string;
  startOver: string;
  allDoctors: string;
  otcRelief: string;
};

const COPY: Record<AiLanguage, Copy> = {
  en: {
    labels: { self_care: 'Self care', routine: 'See a doctor', urgent: 'Urgent care', emergency: 'Emergency' },
    disclaimer: 'General guidance only — not a diagnosis. Consult a licensed doctor for medical advice.',
    emergencyCta: 'Call emergency / open emergency page',
    book: 'Book a specialist',
    symptomChecker: 'Full symptom checker',
    ask: 'Ask a follow-up',
    sourceAi: 'Gemini AI',
    sourceLocal: 'MediConnect safety engine',
    greeting: 'Hi! I’m the MediConnect health assistant. Tell me what you’re feeling — for example “fever and sore throat since yesterday”. I can suggest next steps, but I’m not a doctor.',
    placeholder: 'Describe your symptoms…',
    send: 'Send',
    thinking: 'Checking reliable guidance…',
    listening: 'Listening…',
    voice: 'Voice input',
    reset: 'New chat',
    close: 'Close assistant',
    open: 'Open health assistant',
    title: 'AI Health Assistant',
    subtitle: 'Guidance in English, हिंदी and मराठी',
    quick: ['Fever and sore throat', 'Headache and dizziness', 'Stomach pain and vomiting', 'Chest pain'],
    followUps: [
      'How long have you had these symptoms?',
      'How severe are they — mild, moderate or severe?',
      'Any existing conditions or medicines you take regularly?',
      'Any red flags: chest pain, trouble breathing, severe bleeding or fainting?',
    ],
    selfCare: 'What you can do now',
    redFlags: 'Red flags to watch for',
    conditions: 'Possible explanations',
    urgentNote: 'If symptoms worsen quickly, seek in-person care immediately.',
    notMedicalAdvice: 'Not medical advice',
    noMatch: 'No close pattern matched. Monitor your symptoms and consult a doctor if they persist or worsen.',
    worsened: 'Since symptoms are moderate or severe, please speak to a doctor rather than relying on self-care alone.',
    emergencyReply: 'This sounds like it could be a medical emergency. Please call an ambulance or go to the nearest emergency department now. Do not wait for an online reply.',
    generalReply: 'I can help you understand common symptoms and decide whether to see a doctor. Share what you are feeling, how long it has lasted and how severe it is.',
    medicineReply: 'For medicine questions, a pharmacist or doctor should confirm the right dose and whether it is safe with your other medicines. You can compare genuine OTC options in the Medicine Store, but prescription medicines need a valid prescription.',
    bookingReply: 'You can book an in-person or video consultation with a verified MediConnect doctor. Pick a specialist, choose a slot and pay online or at the clinic.',
    durationToday: 'since today',
    durationDays: 'for a few days',
    durationWeek: 'for about a week',
    durationLonger: 'for more than a week',
    severityMild: 'mild',
    severityModerate: 'moderate',
    severitySevere: 'severe',
    redFlagQuestion: 'Do you have any of these warning signs?',
    redFlagNone: 'None of these',
    redFlagChest: 'Chest pain or pressure',
    redFlagBreathing: 'Difficulty breathing',
    redFlagBleeding: 'Severe bleeding',
    redFlagFainting: 'Fainting or confusion',
    child: 'Child under 12',
    adult: 'Adult',
    senior: 'Senior (65+)',
    ageQuestion: 'Who is this for?',
    feelingQuestion: 'What are you feeling?',
    durationQuestion: 'How long?',
    severityQuestion: 'How severe?',
    notesQuestion: 'Anything else? (optional)',
    howItWorksTitle: 'How this works',
    howItWorksBody: 'Gemini AI reads your answers when configured; otherwise a safety-first rules engine built into MediConnect does. Red-flag symptoms always escalate immediately.',
    doctorQuestions: 'Questions a doctor may ask',
    startOver: 'Start over',
    allDoctors: 'All doctors',
    otcRelief: 'OTC relief',
  },
  hi: {
    labels: { self_care: 'घरेलू देखभाल', routine: 'डॉक्टर से मिलें', urgent: 'तुरंत डॉक्टर', emergency: 'आपातकाल' },
    disclaimer: 'यह केवल सामान्य जानकारी है, निदान नहीं। चिकित्सकीय सलाह के लिए लाइसेंस प्राप्त डॉक्टर से मिलें।',
    emergencyCta: 'आपातकालीन कॉल / पेज खोलें',
    book: 'विशेषज्ञ बुक करें',
    symptomChecker: 'पूरा लक्षण जाँच',
    ask: 'आगे पूछें',
    sourceAi: 'Gemini AI',
    sourceLocal: 'MediConnect सुरक्षा इंजन',
    greeting: 'नमस्ते! मैं MediConnect स्वास्थ्य सहायक हूँ। बताइए आपको क्या महसूस हो रहा है — जैसे “कल से बुखार और गले में दर्द”। मैं अगले कदम सुझा सकता हूँ, पर मैं डॉक्टर नहीं हूँ।',
    placeholder: 'अपने लक्षण बताइए…',
    send: 'भेजें',
    thinking: 'भरोसेमंद जानकारी देख रहे हैं…',
    listening: 'सुन रहे हैं…',
    voice: 'आवाज़ से लिखें',
    reset: 'नई बातचीत',
    close: 'सहायक बंद करें',
    open: 'स्वास्थ्य सहायक खोलें',
    title: 'AI स्वास्थ्य सहायक',
    subtitle: 'English, हिंदी और मराठी में मार्गदर्शन',
    quick: ['बुखार और गले में दर्द', 'सिरदर्द और चक्कर', 'पेट दर्द और उल्टी', 'छाती में दर्द'],
    followUps: [
      'ये लक्षण कितने समय से हैं?',
      'लक्षण हल्के, मध्यम या गंभीर हैं?',
      'कोई पुरानी बीमारी या नियमित दवा है?',
      'कोई खतरे के संकेत: छाती में दर्द, साँस लेने में तकलीफ, अधिक रक्तस्राव या बेहोशी?',
    ],
    selfCare: 'अभी क्या कर सकते हैं',
    redFlags: 'इन खतरे के संकेतों पर ध्यान दें',
    conditions: 'संभावित कारण',
    urgentNote: 'अगर लक्षण तेज़ी से बिगड़ें, तुरंत अस्पताल जाएँ।',
    notMedicalAdvice: 'चिकित्सकीय सलाह नहीं',
    noMatch: 'कोई स्पष्ट पैटर्न नहीं मिला। लक्षणों पर नज़र रखें और बने रहने या बिगड़ने पर डॉक्टर से मिलें।',
    worsened: 'लक्षण मध्यम या गंभीर हैं, इसलिए केवल घरेलू देखभाल पर निर्भर न रहें — डॉक्टर से बात करें।',
    emergencyReply: 'यह आपातकालीन स्थिति हो सकती है। कृपया तुरंत एम्बुलेंस बुलाएँ या नज़दीकी आपातकालीन विभाग जाएँ। ऑनलाइन जवाब का इंतज़ार न करें।',
    generalReply: 'मैं सामान्य लक्षण समझने और डॉक्टर से मिलना चाहिए या नहीं, इसमें मदद कर सकता हूँ। बताइए क्या महसूस हो रहा है, कितने समय से है और कितना गंभीर है।',
    medicineReply: 'दवा की सही खुराक और दूसरी दवाओं के साथ सुरक्षा के लिए फार्मासिस्ट या डॉक्टर से पुष्टि करें। Medicine Store में असली OTC विकल्प देख सकते हैं, पर प्रिस्क्रिप्शन दवा के लिए वैध पर्चा ज़रूरी है।',
    bookingReply: 'आप सत्यापित MediConnect डॉक्टर के साथ क्लिनिक या वीडियो परामर्श बुक कर सकते हैं। विशेषज्ञ चुनें, समय चुनें और ऑनलाइन या क्लिनिक में भुगतान करें।',
    durationToday: 'आज से',
    durationDays: 'कुछ दिनों से',
    durationWeek: 'लगभग एक सप्ताह से',
    durationLonger: 'एक सप्ताह से अधिक',
    severityMild: 'हल्के',
    severityModerate: 'मध्यम',
    severitySevere: 'गंभीर',
    redFlagQuestion: 'क्या इनमें से कोई खतरे का संकेत है?',
    redFlagNone: 'इनमें से कोई नहीं',
    redFlagChest: 'छाती में दर्द या दबाव',
    redFlagBreathing: 'साँस लेने में तकलीफ',
    redFlagBleeding: 'अधिक रक्तस्राव',
    redFlagFainting: 'बेहोशी या भ्रम',
    child: '12 वर्ष से छोटा बच्चा',
    adult: 'वयस्क',
    senior: 'वरिष्ठ (65+)',
    ageQuestion: 'यह किसके लिए है?',
    feelingQuestion: 'आपको क्या महसूस हो रहा है?',
    durationQuestion: 'कितने समय से?',
    severityQuestion: 'कितना गंभीर?',
    notesQuestion: 'कुछ और? (वैकल्पिक)',
    howItWorksTitle: 'यह कैसे काम करता है',
    howItWorksBody: 'कॉन्फ़िगर होने पर Gemini AI आपके उत्तर पढ़ता है; अन्यथा MediConnect का सुरक्षा-प्रथम नियम इंजन मार्गदर्शन देता है। खतरे के लक्षण तुरंत आपातकालीन चेतावनी देते हैं।',
    doctorQuestions: 'डॉक्टर क्या पूछ सकते हैं',
    startOver: 'फिर से शुरू करें',
    allDoctors: 'सभी डॉक्टर',
    otcRelief: 'OTC राहत',
  },
  mr: {
    labels: { self_care: 'घरगुती काळजी', routine: 'डॉक्टरांना भेटा', urgent: 'तातडीने डॉक्टर', emergency: 'आपत्कालीन' },
    disclaimer: 'हे फक्त सामान्य माहिती आहे, निदान नाही. वैद्यकीय सल्ल्यासाठी परवानाधारक डॉक्टरांना भेटा.',
    emergencyCta: 'आपत्कालीन कॉल / पेज उघडा',
    book: 'तज्ज्ञ बुक करा',
    symptomChecker: 'संपूर्ण लक्षण तपासणी',
    ask: 'पुढे विचारा',
    sourceAi: 'Gemini AI',
    sourceLocal: 'MediConnect सुरक्षा इंजिन',
    greeting: 'नमस्कार! मी MediConnect आरोग्य सहाय्यक आहे. तुम्हाला काय जाणवत आहे सांगा — उदा. “कालपासून ताप आणि घसादुखी”. मी पुढील पावले सुचवू शकतो, पण मी डॉक्टर नाही.',
    placeholder: 'तुमची लक्षणे सांगा…',
    send: 'पाठवा',
    thinking: 'विश्वासार्ह मार्गदर्शन तपासत आहे…',
    listening: 'ऐकत आहे…',
    voice: 'आवाजाने लिहा',
    reset: 'नवीन संभाषण',
    close: 'सहाय्यक बंद करा',
    open: 'आरोग्य सहाय्यक उघडा',
    title: 'AI आरोग्य सहाय्यक',
    subtitle: 'English, हिंदी आणि मराठीत मार्गदर्शन',
    quick: ['ताप आणि घसादुखी', 'डोकेदुखी आणि चक्कर', 'पोटदुखी आणि उलटी', 'छातीत दुखणे'],
    followUps: [
      'ही लक्षणे किती दिवसांपासून आहेत?',
      'लक्षणे सौम्य, मध्यम की तीव्र आहेत?',
      'कोणता जुना आजार किंवा नियमित औषध आहे?',
      'धोक्याची चिन्हे: छातीत दुखणे, श्वास घेण्यास त्रास, जास्त रक्तस्राव किंवा बेशुद्धी?',
    ],
    selfCare: 'आता काय करू शकता',
    redFlags: 'या धोक्याच्या चिन्हांकडे लक्ष द्या',
    conditions: 'संभाव्य कारणे',
    urgentNote: 'लक्षणे झपाट्याने बिघडल्यास तातडीने रुग्णालयात जा.',
    notMedicalAdvice: 'वैद्यकीय सल्ला नाही',
    noMatch: 'स्पष्ट जुळणी आढळली नाही. लक्षणांवर लक्ष ठेवा आणि टिकून राहिल्यास किंवा बिघडल्यास डॉक्टरांना भेटा.',
    worsened: 'लक्षणे मध्यम किंवा तीव्र आहेत, म्हणून फक्त घरगुती काळजीवर अवलंबून राहू नका — डॉक्टरांशी बोला.',
    emergencyReply: 'ही आपत्कालीन स्थिती असू शकते. कृपया तातडीने रुग्णवाहिका बोलवा किंवा जवळच्या आपत्कालीन विभागात जा. ऑनलाइन उत्तराची वाट पाहू नका.',
    generalReply: 'सामान्य लक्षणे समजून घेण्यास आणि डॉक्टरांना भेटावे का हे ठरवण्यास मी मदत करू शकतो. काय जाणवते, किती दिवसांपासून आहे आणि किती तीव्र आहे सांगा.',
    medicineReply: 'औषधाची योग्य मात्रा आणि इतर औषधांसोबत सुरक्षितता फार्मासिस्ट किंवा डॉक्टरांकडून तपासा. Medicine Store मध्ये खात्रीशीर OTC पर्याय पाहू शकता, पण प्रिस्क्रिप्शन औषधासाठी वैध चिठ्ठी आवश्यक आहे.',
    bookingReply: 'तुम्ही पडताळलेल्या MediConnect डॉक्टरांसोबत क्लिनिक किंवा व्हिडिओ सल्ला बुक करू शकता. तज्ज्ञ निवडा, वेळ निवडा आणि ऑनलाइन किंवा क्लिनिकमध्ये पैसे द्या.',
    durationToday: 'आजपासून',
    durationDays: 'काही दिवसांपासून',
    durationWeek: 'सुमारे एक आठवड्यापासून',
    durationLonger: 'एक आठवड्यापेक्षा जास्त',
    severityMild: 'सौम्य',
    severityModerate: 'मध्यम',
    severitySevere: 'तीव्र',
    redFlagQuestion: 'यापैकी धोक्याची चिन्हे आहेत का?',
    redFlagNone: 'यापैकी काहीही नाही',
    redFlagChest: 'छातीत दुखणे किंवा दबाव',
    redFlagBreathing: 'श्वास घेण्यास त्रास',
    redFlagBleeding: 'जास्त रक्तस्राव',
    redFlagFainting: 'बेशुद्धी किंवा गोंधळ',
    child: '12 वर्षांखालील मूल',
    adult: 'प्रौढ',
    senior: 'ज्येष्ठ (65+)',
    ageQuestion: 'हे कोणासाठी आहे?',
    feelingQuestion: 'तुम्हाला काय जाणवत आहे?',
    durationQuestion: 'किती दिवसांपासून?',
    severityQuestion: 'किती तीव्र?',
    notesQuestion: 'अजून काही? (ऐच्छिक)',
    howItWorksTitle: 'हे कसे काम करते',
    howItWorksBody: 'कॉन्फिगर केल्यास Gemini AI तुमची उत्तरे वाचते; अन्यथा MediConnectचे सुरक्षा-प्रथम नियम इंजिन मार्गदर्शन देते. धोक्याची लक्षणे लगेच आपत्कालीन सूचना देतात.',
    doctorQuestions: 'डॉक्टर काय विचारू शकतात',
    startOver: 'पुन्हा सुरू करा',
    allDoctors: 'सर्व डॉक्टर',
    otcRelief: 'OTC आराम',
  },
};

/** Localised symptom chip labels (the triage engine itself always uses ids). */
const SYMPTOM_LABELS: Record<AiLanguage, Record<string, string>> = {
  en: {},
  hi: {
    fever: 'बुखार', cough: 'खांसी', sore_throat: 'गले में दर्द', headache: 'सिरदर्द',
    body_ache: 'शरीर में दर्द', fatigue: 'थकान / कमजोरी', runny_nose: 'नाक बहना / बंद नाक',
    nausea: 'मतली', vomiting: 'उल्टी', diarrhea: 'दस्त', abdominal_pain: 'पेट दर्द',
    chest_pain: 'छाती में दर्द', shortness_of_breath: 'साँस लेने में तकलीफ', dizziness: 'चक्कर',
    rash: 'त्वचा पर दाने', joint_pain: 'जोड़ों में दर्द', loss_of_taste_smell: 'स्वाद/गंध न आना',
    eye_redness: 'आँख में लालिमा/जलन', severe_bleeding: 'अधिक रक्तस्राव',
    loss_of_consciousness: 'बेहोशी / बेसुध होना',
  },
  mr: {
    fever: 'ताप', cough: 'खोकला', sore_throat: 'घसादुखी', headache: 'डोकेदुखी',
    body_ache: 'अंगदुखी', fatigue: 'थकवा / अशक्तपणा', runny_nose: 'नाक वाहणे / बंद नाक',
    nausea: 'मळमळ', vomiting: 'उलटी', diarrhea: 'जुलाब', abdominal_pain: 'पोटदुखी',
    chest_pain: 'छातीत दुखणे', shortness_of_breath: 'श्वास घेण्यास त्रास', dizziness: 'चक्कर',
    rash: 'त्वचेवर पुरळ', joint_pain: 'सांधेदुखी', loss_of_taste_smell: 'चव/वास न येणे',
    eye_redness: 'डोळ्यांत लालसरपणा/जळजळ', severe_bleeding: 'जास्त रक्तस्राव',
    loss_of_consciousness: 'बेशुद्धी / शुद्ध हरपणे',
  },
};

export function symptomLabel(id: string, language: AiLanguage): string {
  return SYMPTOM_LABELS[language][id]
    ?? SYMPTOM_LIST.find((s) => s.id === id)?.label
    ?? id;
}

export function copyFor(language: AiLanguage): Copy {
  return COPY[language];
}

const RED_FLAG_IDS = ['chest_pain', 'shortness_of_breath', 'severe_bleeding', 'loss_of_consciousness'];

const SPECIALIST_BY_SYMPTOM: Record<string, string> = {
  chest_pain: 'Cardiologist',
  shortness_of_breath: 'Pulmonologist',
  headache: 'Neurologist',
  dizziness: 'Neurologist',
  rash: 'Dermatologist',
  eye_redness: 'Ophthalmologist',
  joint_pain: 'Orthopaedic Surgeon',
  abdominal_pain: 'Gastroenterologist',
  nausea: 'Gastroenterologist',
  vomiting: 'Gastroenterologist',
  diarrhea: 'Gastroenterologist',
  fever: 'General Physician',
  cough: 'General Physician',
  sore_throat: 'General Physician',
  runny_nose: 'General Physician',
  body_ache: 'General Physician',
  fatigue: 'General Physician',
};

const SPECIALIST_LABEL: Record<string, Record<AiLanguage, string>> = {
  'General Physician': { en: 'General Physician', hi: 'सामान्य चिकित्सक', mr: 'सामान्य डॉक्टर' },
  Cardiologist: { en: 'Cardiologist', hi: 'हृदय रोग विशेषज्ञ', mr: 'हृदयरोग तज्ज्ञ' },
  Pulmonologist: { en: 'Pulmonologist', hi: 'फेफड़े विशेषज्ञ', mr: 'फुफ्फुस तज्ज्ञ' },
  Neurologist: { en: 'Neurologist', hi: 'न्यूरोलॉजिस्ट', mr: 'न्यूरोलॉजिस्ट' },
  Dermatologist: { en: 'Dermatologist', hi: 'त्वचा विशेषज्ञ', mr: 'त्वचारोग तज्ज्ञ' },
  Ophthalmologist: { en: 'Ophthalmologist', hi: 'नेत्र विशेषज्ञ', mr: 'नेत्रतज्ज्ञ' },
  'Orthopaedic Surgeon': { en: 'Orthopaedic Surgeon', hi: 'हड्डी रोग विशेषज्ञ', mr: 'अस्थिरोग तज्ज्ञ' },
  Gastroenterologist: { en: 'Gastroenterologist', hi: 'पेट विशेषज्ञ', mr: 'पोटाचे तज्ज्ञ' },
};

export function specialistLabel(specialist: string, language: AiLanguage): string {
  return SPECIALIST_LABEL[specialist]?.[language] ?? specialist;
}

const CONDITION_TEXT: Record<string, Record<AiLanguage, { name: string; advice: string }>> = {
  'Common Cold': {
    en: { name: 'Common cold', advice: 'Rest, warm fluids and steam inhalation often help. See a doctor if symptoms last beyond 7 days or breathing becomes difficult.' },
    hi: { name: 'सामान्य सर्दी', advice: 'आराम, गरम तरल और भाप लेना मदद कर सकता है। 7 दिन से अधिक रहने या साँस लेने में तकलीफ होने पर डॉक्टर से मिलें।' },
    mr: { name: 'सामान्य सर्दी', advice: 'विश्रांती, गरम पेय आणि वाफ घेणे उपयुक्त ठरते. 7 दिवसांपेक्षा जास्त राहिल्यास किंवा श्वास घेण्यास त्रास झाल्यास डॉक्टरांना भेटा.' },
  },
  'Influenza (Flu)': {
    en: { name: 'Influenza (flu)', advice: 'Rest and fluids matter most. Paracetamol can ease fever and body ache at the labelled dose. Seek care if fever is above 102°F, lasts 3+ days, or you feel very weak.' },
    hi: { name: 'इन्फ्लुएंजा (फ्लू)', advice: 'आराम और तरल सबसे ज़रूरी है। लेबल की खुराक पर पैरासिटामोल बुखार और बदन दर्द कम कर सकता है। 102°F से अधिक बुखार, 3 दिन से अधिक या बहुत कमजोरी होने पर डॉक्टर से मिलें।' },
    mr: { name: 'इन्फ्लुएंजा (फ्लू)', advice: 'विश्रांती आणि पेय सर्वात महत्त्वाचे. लेबलवरील मात्रेत पॅरासिटामॉल ताप आणि अंगदुखी कमी करू शकते. 102°F पेक्षा जास्त ताप, 3 दिवसांपेक्षा जास्त किंवा खूप अशक्तपणा असल्यास डॉक्टरांना भेटा.' },
  },
  'COVID-19 (possible)': {
    en: { name: 'COVID-19 (possible)', advice: 'Consider a rapid test and avoid close contact with vulnerable people. Seek medical advice if breathlessness, chest pain or low oxygen occurs.' },
    hi: { name: 'COVID-19 (संभावित)', advice: 'रैपिड टेस्ट करें और जोखिम वाले लोगों से दूरी रखें। साँस फूलने, छाती में दर्द या ऑक्सीजन कम होने पर डॉक्टर से सलाह लें।' },
    mr: { name: 'COVID-19 (शक्य)', advice: 'रॅपिड चाचणी करा आणि जोखमीच्या लोकांपासून अंतर ठेवा. दम लागणे, छातीत दुखणे किंवा ऑक्सिजन कमी झाल्यास डॉक्टरांचा सल्ला घ्या.' },
  },
  'Gastroenteritis (Stomach Flu)': {
    en: { name: 'Stomach infection', advice: 'Use ORS frequently, eat light food and avoid oily meals. Seek care if vomiting or diarrhea lasts beyond 2 days, or there is blood, high fever or signs of dehydration.' },
    hi: { name: 'पेट का संक्रमण', advice: 'बार-बार ORS लें, हल्का भोजन करें और तली चीज़ें टालें। उल्टी/दस्त 2 दिन से अधिक, खून, तेज़ बुखार या पानी की कमी होने पर डॉक्टर से मिलें।' },
    mr: { name: 'पोटाचा संसर्ग', advice: 'वारंवार ORS घ्या, हलके अन्न खा आणि तेलकट टाळा. उलटी/जुलाब 2 दिवसांपेक्षा जास्त, रक्त, तीव्र ताप किंवा पाण्याची कमतरता असल्यास डॉक्टरांना भेटा.' },
  },
  'Migraine / Tension Headache': {
    en: { name: 'Migraine or tension headache', advice: 'Rest in a quiet, dark room, hydrate and avoid skipping meals. Get urgent help for a sudden “worst-ever” headache, weakness, confusion or fever with neck stiffness.' },
    hi: { name: 'माइग्रेन या टेंशन सिरदर्द', advice: 'शांत, अंधेरे कमरे में आराम करें, पानी पिएँ और भोजन न छोड़ें। अचानक सबसे तेज़ सिरदर्द, कमजोरी, भ्रम या बुखार के साथ गर्दन अकड़न पर तुरंत मदद लें।' },
    mr: { name: 'मायग्रेन किंवा तणाव डोकेदुखी', advice: 'शांत, अंधाऱ्या खोलीत विश्रांती घ्या, पाणी प्या आणि जेवण चुकवू नका. अचानक सर्वात तीव्र डोकेदुखी, अशक्तपणा, गोंधळ किंवा तापासह मान ताठल्यास तातडीने मदत घ्या.' },
  },
  'Allergic Reaction': {
    en: { name: 'Mild allergic reaction', advice: 'Avoid the trigger. A pharmacist can advise on an antihistamine. Call emergency services for facial/throat swelling, wheezing or breathing difficulty.' },
    hi: { name: 'हल्की एलर्जी', advice: 'कारण से बचें। एंटीहिस्टामिन के लिए फार्मासिस्ट से सलाह लें। चेहरा/गला सूजने, घरघराहट या साँस लेने में तकलीफ होने पर आपातकालीन सेवा बुलाएँ।' },
    mr: { name: 'सौम्य अ‍ॅलर्जी', advice: 'कारण टाळा. अँटीहिस्टामिनसाठी फार्मासिस्टचा सल्ला घ्या. चेहरा/घसा सुजणे, घरघर किंवा श्वास घेण्यास त्रास झाल्यास आपत्कालीन सेवा बोलवा.' },
  },
  'Viral Arthralgia / Joint Infection': {
    en: { name: 'Viral joint pain', advice: 'Rest the joint and stay hydrated. See a doctor if it becomes hot, swollen, very painful or is accompanied by high fever.' },
    hi: { name: 'वायरल जोड़ों का दर्द', advice: 'जोड़ को आराम दें और पानी पिएँ। जोड़ गर्म, सूजा, बहुत दर्दभरा हो या तेज़ बुखार हो तो डॉक्टर से मिलें।' },
    mr: { name: 'व्हायरल सांधेदुखी', advice: 'सांध्याला विश्रांती द्या आणि पाणी प्या. सांधा गरम, सुजलेला, खूप दुखणारा असेल किंवा तीव्र ताप असेल तर डॉक्टरांना भेटा.' },
  },
  'Possible Cardiac or Respiratory Emergency': {
    en: { name: 'Possible cardiac or breathing emergency', advice: 'Call emergency services now. Do not drive yourself. Chew aspirin only if a clinician or emergency dispatcher tells you to.' },
    hi: { name: 'संभावित हृदय या श्वास आपातकाल', advice: 'अभी आपातकालीन सेवा बुलाएँ। खुद गाड़ी न चलाएँ। एस्पिरिन केवल तब लें जब डॉक्टर या आपातकालीन ऑपरेटर कहें।' },
    mr: { name: 'संभाव्य हृदय किंवा श्वास आपत्काल', advice: 'आता आपत्कालीन सेवा बोलवा. स्वतः गाडी चालवू नका. डॉक्टर किंवा आपत्कालीन ऑपरेटर सांगितल्याशिवाय एस्पिरिन घेऊ नका.' },
  },
  'Severe Trauma / Medical Emergency': {
    en: { name: 'Severe injury or medical emergency', advice: 'Call an ambulance immediately. Apply pressure to bleeding if trained, keep the person still and do not give food or drink.' },
    hi: { name: 'गंभीर चोट या आपातकाल', advice: 'तुरंत एम्बुलेंस बुलाएँ। प्रशिक्षित हों तो रक्तस्राव पर दबाव डालें, व्यक्ति को स्थिर रखें और कुछ खिलाएँ-पिलाएँ नहीं।' },
    mr: { name: 'गंभीर दुखापत किंवा आपत्काल', advice: 'तातडीने रुग्णवाहिका बोलवा. प्रशिक्षित असल्यास रक्तस्रावावर दाब द्या, व्यक्तीला स्थिर ठेवा आणि काही खायला-प्यायला देऊ नका.' },
  },
  'No specific match found': {
    en: { name: 'No specific pattern matched', advice: 'Monitor your symptoms. If they persist beyond a few days, worsen, or interfere with daily life, consult a doctor.' },
    hi: { name: 'कोई विशेष पैटर्न नहीं मिला', advice: 'लक्षणों पर नज़र रखें। कुछ दिनों से अधिक रहें, बिगड़ें या दैनिक काम प्रभावित करें तो डॉक्टर से मिलें।' },
    mr: { name: 'विशिष्ट नमुना आढळला नाही', advice: 'लक्षणांवर लक्ष ठेवा. काही दिवसांपेक्षा जास्त राहिल्यास, बिघडल्यास किंवा दैनिक कामावर परिणाम झाल्यास डॉक्टरांना भेटा.' },
  },
};

function normalizeSymptomText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  fever: ['fever', 'temperature', 'bukhar', 'बुखार', 'ताप'],
  cough: ['cough', 'khansi', 'खांसी', 'खोकला'],
  sore_throat: ['sore throat', 'throat pain', 'gala', 'गला', 'घसा'],
  headache: ['headache', 'head pain', 'sir dard', 'सिरदर्द', 'डोकेदुखी'],
  body_ache: ['body ache', 'body pain', 'बदन दर्द', 'अंगदुखी'],
  fatigue: ['fatigue', 'weakness', 'tired', 'थकान', 'अशक्तपणा'],
  runny_nose: ['runny nose', 'blocked nose', 'cold', 'नाक बहना', 'नाक वाहणे'],
  nausea: ['nausea', 'मतली', 'मळमळ'],
  vomiting: ['vomiting', 'vomit', 'उल्टी', 'उलटी'],
  diarrhea: ['diarrhea', 'loose motion', 'दस्त', 'जुलाब'],
  abdominal_pain: ['stomach pain', 'abdominal', 'पेट दर्द', 'पोटदुखी'],
  chest_pain: ['chest pain', 'chest pressure', 'छाती में दर्द', 'छातीत दुखणे'],
  shortness_of_breath: ['breathless', 'shortness of breath', 'difficulty breathing', 'साँस', 'श्वास'],
  dizziness: ['dizzy', 'dizziness', 'चक्कर', 'चक्कर'],
  rash: ['rash', 'skin', 'दाने', 'पुरळ'],
  joint_pain: ['joint pain', 'जोड़', 'सांधे'],
  loss_of_taste_smell: ['taste', 'smell', 'स्वाद', 'वास'],
  eye_redness: ['eye', 'आँख', 'डोळा'],
  severe_bleeding: ['bleeding', 'रक्तस्राव', 'रक्त'],
  loss_of_consciousness: ['unconscious', 'fainting', 'बेहोश', 'बेशुद्ध'],
};

export function extractSymptoms(text: string): string[] {
  const normalized = normalizeSymptomText(text);
  const found = new Set<string>();
  for (const [id, words] of Object.entries(KEYWORD_SYNONYMS)) {
    if (words.some((word) => normalized.includes(normalizeSymptomText(word)))) found.add(id);
  }
  return [...found];
}

function symptomsFromLabels(labels: string[]): string[] {
  return labels
    .map((label) => SYMPTOM_LIST.find((s) => s.label.toLowerCase() === label.toLowerCase() || s.id === label)?.id)
    .filter((id): id is string => !!id);
}

function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}

function severityUrgency(severity: Severity): Urgency {
  if (severity === 'severe') return 'urgent';
  if (severity === 'moderate') return 'routine';
  return 'self_care';
}

function pickSpecialist(symptoms: string[], conditions: string[]): string {
  for (const symptom of symptoms) {
    const specialist = SPECIALIST_BY_SYMPTOM[symptom];
    if (specialist && specialist !== 'General Physician') return specialist;
  }
  if (conditions.some((c) => /cardiac|heart/i.test(c))) return 'Cardiologist';
  if (conditions.some((c) => /gastro|stomach/i.test(c))) return 'Gastroenterologist';
  if (conditions.some((c) => /allerg|skin/i.test(c))) return 'Dermatologist';
  return 'General Physician';
}

function followUpsFor(symptoms: string[], language: AiLanguage): string[] {
  const copy = COPY[language];
  const out: string[] = [];
  if (symptoms.includes('fever')) {
    out.push(language === 'en' ? 'What is the highest temperature, and are you measuring it with a thermometer?'
      : language === 'hi' ? 'सबसे अधिक तापमान कितना है और क्या थर्मामीटर से मापा है?'
        : 'सर्वाधिक तापमान किती आहे आणि थर्मामीटरने मोजले आहे का?');
  }
  if (symptoms.includes('cough') || symptoms.includes('sore_throat')) {
    out.push(language === 'en' ? 'Is the cough dry or bringing up phlegm, and is there any blood?'
      : language === 'hi' ? 'खांसी सूखी है या बलगम के साथ, और क्या खून आ रहा है?'
        : 'खोकला कोरडा आहे की कफासह, आणि रक्त येत आहे का?');
  }
  if (symptoms.includes('diarrhea') || symptoms.includes('vomiting')) {
    out.push(language === 'en' ? 'Are you able to keep fluids down, and how many times have you vomited or passed stool today?'
      : language === 'hi' ? 'क्या तरल पदार्थ पीकर रख पा रहे हैं, और आज कितनी बार उल्टी/दस्त हुआ?'
        : 'द्रव पदार्थ पिऊन ठेवू शकता का, आणि आज किती वेळा उलटी/जुलाब झाला?');
  }
  if (symptoms.includes('headache')) {
    out.push(language === 'en' ? 'Was the headache sudden and severe, and is there any weakness, confusion or neck stiffness?'
      : language === 'hi' ? 'सिरदर्द अचानक और तेज़ था, और क्या कमजोरी, भ्रम या गर्दन अकड़न है?'
        : 'डोकेदुखी अचानक आणि तीव्र होती का, आणि अशक्तपणा, गोंधळ किंवा मान ताठर आहे का?');
  }
  out.push(copy.followUps[2]!);
  if (out.length < 2) out.push(copy.followUps[0]!);
  return out.slice(0, 4);
}

/** Deterministic triage used whenever Gemini is unavailable. */
export function localTriage(context: TriageContext, language: AiLanguage): AiHealthAnswer {
  const copy = COPY[language];
  const symptoms = [...new Set([...context.symptoms, ...symptomsFromLabels(context.symptoms)])];
  const analysis = analyzeSymptoms(symptoms);
  const critical = symptoms.some((s) => RED_FLAG_IDS.includes(s)) || (context.redFlags?.length ?? 0) > 0;
  const conditions = analysis.results.map((r) => r.condition);
  const specialist = pickSpecialist(symptoms, conditions);

  let urgency: Urgency = critical ? 'emergency' : severityUrgency(analysis.overallSeverity);
  if (context.severity === 'severe') urgency = maxUrgency(urgency, 'urgent');
  if (context.severity === 'moderate') urgency = maxUrgency(urgency, 'routine');
  if (context.duration === 'week' || context.duration === 'longer') urgency = maxUrgency(urgency, 'routine');
  if (context.ageGroup === 'child' && analysis.overallSeverity !== 'mild') urgency = maxUrgency(urgency, 'urgent');
  if (context.ageGroup === 'senior' && symptoms.includes('fever')) urgency = maxUrgency(urgency, 'routine');
  if (urgency === 'emergency') urgency = 'emergency';

  const topConditions = analysis.results.slice(0, urgency === 'emergency' ? 1 : 3);
  const conditionNames = topConditions.map((c) => CONDITION_TEXT[c.condition]?.[language]?.name ?? c.condition);
  const advice = topConditions
    .map((c) => CONDITION_TEXT[c.condition]?.[language]?.advice ?? c.action)
    .filter(Boolean)
    .slice(0, 2);

  const symptomLabels = symptoms
    .map((id) => SYMPTOM_LIST.find((s) => s.id === id)?.label)
    .filter((label): label is string => !!label);

  const redFlags = critical
    ? (context.redFlags?.length ? context.redFlags : [copy.followUps[3]!])
    : [];

  const durationText = context.duration ? copy[`duration${context.duration === 'days' ? 'Days' : context.duration === 'week' ? 'Week' : context.duration === 'longer' ? 'Longer' : 'Today'}` as keyof Copy] : '';
  const severityText = context.severity ? copy[`severity${context.severity === 'mild' ? 'Mild' : context.severity === 'moderate' ? 'Moderate' : 'Severe'}` as keyof Copy] : '';

  const headline = urgency === 'emergency'
    ? copy.emergencyReply
    : urgency === 'urgent'
      ? copy.worsened
      : `${copy.conditions}: ${conditionNames.join(', ') || copy.noMatch}`;

  const reply = [
    symptomLabels.length ? `${symptomLabels.join(', ')}${durationText ? ` ${durationText}` : ''}${severityText ? ` — ${severityText}` : ''}.` : '',
    urgency === 'emergency' ? copy.emergencyReply : (advice[0] ?? copy.noMatch),
    urgency === 'urgent' || urgency === 'routine' ? copy.urgentNote : '',
  ].filter(Boolean).join(' ');

  const selfCare = urgency === 'emergency'
    ? [copy.emergencyReply, copy.urgentNote]
    : [
      ...advice,
      language === 'en' ? 'Drink water regularly and get enough rest.' : language === 'hi' ? 'नियमित पानी पिएँ और पर्याप्त आराम करें।' : 'नियमित पाणी प्या आणि पुरेशी विश्रांती घ्या.',
      ...(urgency === 'urgent' || urgency === 'routine' ? [copy.worsened] : []),
    ].slice(0, 4);

  return {
    source: 'local',
    mode: 'triage',
    language,
    urgency,
    headline,
    reply,
    conditions: conditionNames.length ? conditionNames : [copy.noMatch],
    redFlags,
    specialist,
    followUpQuestions: followUpsFor(symptoms, language),
    selfCare,
    actions: urgency === 'emergency'
      ? [copy.emergencyCta]
      : [copy.book, copy.symptomChecker],
    disclaimer: copy.disclaimer,
  };
}

const CHAT_INTENTS: { test: RegExp; key: 'medicine' | 'booking' | 'greeting' }[] = [
  { test: /medicine|tablet|dose|paracetamol|dolo|antibiotic|दवा|औषध|गोळी/i, key: 'medicine' },
  { test: /book|appointment|consult|doctor|slot|डॉक्टर|अपॉइंटमेंट|भेट/i, key: 'booking' },
  { test: /^(hi|hello|hey|namaste|नमस्ते|नमस्कार)/i, key: 'greeting' },
];

/** Deterministic chat fallback that still answers usefully for common intents. */
export function localChat(message: string, history: ChatTurn[], language: AiLanguage): AiHealthAnswer {
  const copy = COPY[language];
  const symptoms = extractSymptoms(message);
  if (symptoms.length > 0) {
    const triage = localTriage({ symptoms, notes: message }, language);
    return { ...triage, mode: 'chat', reply: triage.reply, actions: triage.actions };
  }

  const lastUser = [...history].reverse().find((t) => t.role === 'user')?.content ?? '';
  const combined = `${message} ${lastUser}`;
  if (RED_FLAG_IDS.some((id) => extractSymptoms(combined).includes(id)) || /emergency|ambulance|आपात|आपत्काल/i.test(combined)) {
    return {
      ...localTriage({ symptoms: ['chest_pain'], notes: combined }, language),
      mode: 'chat',
      urgency: 'emergency',
      headline: copy.emergencyReply,
      reply: copy.emergencyReply,
      actions: [copy.emergencyCta],
    };
  }

  const intent = CHAT_INTENTS.find((i) => i.test.test(message))?.key;
  const reply = intent === 'medicine' ? copy.medicineReply
    : intent === 'booking' ? copy.bookingReply
      : intent === 'greeting' ? copy.greeting
        : copy.generalReply;

  return {
    source: 'local',
    mode: 'chat',
    language,
    urgency: 'self_care',
    headline: intent === 'medicine' ? copy.medicineReply : intent === 'booking' ? copy.bookingReply : copy.generalReply,
    reply,
    conditions: [],
    redFlags: [],
    specialist: '',
    followUpQuestions: [
      language === 'en' ? 'What symptoms are bothering you most right now?'
        : language === 'hi' ? 'अभी कौन से लक्षण सबसे ज़्यादा परेशान कर रहे हैं?'
          : 'आता कोणती लक्षणे सर्वात जास्त त्रास देत आहेत?',
      copy.followUps[0]!,
    ],
    selfCare: [],
    actions: intent === 'booking' ? [] : [copy.symptomChecker],
    disclaimer: copy.disclaimer,
  };
}

function toUrgency(value: unknown, fallback: Urgency): Urgency {
  return value === 'emergency' || value === 'urgent' || value === 'routine' || value === 'self_care' ? value : fallback;
}

function stringArray(value: unknown, max = 6): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean).slice(0, max)
    : [];
}

function normalizeRemote(raw: unknown, mode: AiMode, language: AiLanguage): AiHealthAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
  if (!reply && mode === 'chat') return null;

  const local = mode === 'triage' ? localTriage({ symptoms: [] }, language) : localChat(reply, [], language);
  const followUps = stringArray(data.follow_up_questions, 4);
  const actions = stringArray(data.suggested_actions, 5);

  return {
    source: 'gemini',
    mode,
    language,
    urgency: toUrgency(data.urgency, local.urgency),
    headline: typeof data.headline === 'string' ? data.headline : reply,
    reply: reply || local.reply,
    conditions: stringArray(data.likely_conditions, 4),
    redFlags: stringArray(data.red_flags, 6),
    specialist: typeof data.specialist === 'string' ? data.specialist : local.specialist,
    followUpQuestions: followUps.length ? followUps : local.followUpQuestions,
    selfCare: stringArray(data.self_care, 6),
    actions: actions.length ? actions : local.actions,
    disclaimer: typeof data.disclaimer === 'string' ? data.disclaimer : COPY[language].disclaimer,
  };
}

async function invokeAi(body: Record<string, unknown>): Promise<unknown | null> {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-health', { body });
    if (error) return null;
    const payload = data as { data?: unknown } | null;
    return payload?.data ?? data ?? null;
  } catch {
    return null;
  }
}

export async function getTriage(context: TriageContext, language: AiLanguage): Promise<AiHealthAnswer> {
  const local = localTriage(context, language);
  if (local.urgency === 'emergency') return local; // never wait on the network for red flags
  const remote = normalizeRemote(
    await invokeAi({
      mode: 'triage',
      symptoms: context.symptoms,
      message: [
        context.notes,
        context.duration ? `Duration: ${context.duration}` : '',
        context.severity ? `Severity: ${context.severity}` : '',
        context.ageGroup ? `Age group: ${context.ageGroup}` : '',
        context.existingConditions ? `Existing conditions: ${context.existingConditions}` : '',
        context.redFlags?.length ? `Red flags reported: ${context.redFlags.join(', ')}` : 'No red-flag symptoms reported.',
      ].filter(Boolean).join('. '),
      language,
    }),
    'triage',
    language,
  );
  if (!remote) return local;

  // Safety net: the model must never downgrade a local red-flag assessment.
  if (URGENCY_RANK[local.urgency] > URGENCY_RANK[remote.urgency]) {
    return { ...remote, urgency: local.urgency, redFlags: remote.redFlags.length ? remote.redFlags : local.redFlags };
  }
  return remote;
}

export async function getChatReply(
  message: string,
  history: ChatTurn[],
  language: AiLanguage,
  symptomIds: string[] = [],
): Promise<AiHealthAnswer> {
  const local = localChat(message, history, language);
  if (local.urgency === 'emergency') return local;
  const remote = normalizeRemote(
    await invokeAi({
      mode: 'chat',
      message,
      history: history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      symptoms: symptomIds,
      language,
    }),
    'chat',
    language,
  );
  if (!remote) return local;
  if (URGENCY_RANK[local.urgency] > URGENCY_RANK[remote.urgency]) return { ...remote, urgency: local.urgency };
  return remote;
}

/** Convert a canonical specialist name into the specialization filter used by BookAppointment. */
export function specialistQuery(specialist: string): string {
  const map: Record<string, string> = {
    Cardiologist: 'Cardiologist',
    Pulmonologist: 'General Physician',
    Neurologist: 'General Physician',
    Dermatologist: 'Dermatologist',
    Ophthalmologist: 'General Physician',
    'Orthopaedic Surgeon': 'General Physician',
    Gastroenterologist: 'General Physician',
  };
  return map[specialist] ?? 'General Physician';
}

/** Red-flag checklist shared by the symptom checker UI. */
export function redFlagOptions(language: AiLanguage): { id: string; label: string }[] {
  const copy = COPY[language];
  return [
    { id: 'Chest pain or pressure', label: copy.redFlagChest },
    { id: 'Difficulty breathing', label: copy.redFlagBreathing },
    { id: 'Severe bleeding', label: copy.redFlagBleeding },
    { id: 'Fainting or confusion', label: copy.redFlagFainting },
  ];
}

/** Duration / severity / age choices for the guided follow-up form. */
export function followUpChoices(language: AiLanguage) {
  const copy = COPY[language];
  return {
    durations: [
      { id: 'today' as const, label: copy.durationToday },
      { id: 'days' as const, label: copy.durationDays },
      { id: 'week' as const, label: copy.durationWeek },
      { id: 'longer' as const, label: copy.durationLonger },
    ],
    severities: [
      { id: 'mild' as const, label: copy.severityMild },
      { id: 'moderate' as const, label: copy.severityModerate },
      { id: 'severe' as const, label: copy.severitySevere },
    ],
    ageGroups: [
      { id: 'child' as const, label: copy.child },
      { id: 'adult' as const, label: copy.adult },
      { id: 'senior' as const, label: copy.senior },
    ],
  };
}
