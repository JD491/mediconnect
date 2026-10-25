import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingBag } from 'react-icons/fi';
import { useAuth } from '../../lib/AuthContext';
import { useCart } from '../../hooks/useCart';
import { useCheckout } from '../../hooks/useCheckout';
import { EmptyState } from '../../components/UIStates';
import CheckoutStepper from './cart/CheckoutStepper';
import SavedForLaterList from './cart/SavedForLaterList';
import AddressStep from './cart/steps/AddressStep';
import PrescriptionStep from './cart/steps/PrescriptionStep';
import SummaryStep from './cart/steps/SummaryStep';
import PaymentStep from './cart/steps/PaymentStep';
import ConfirmationStep from './cart/steps/ConfirmationStep';

type CartTab = 'cart' | 'saved';

export default function Cart() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CartTab>('cart');

  const cart = useCart(user?.id);
  const checkout = useCheckout(cart, user, profile);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('cart')} className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${tab === 'cart' ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>
          Cart ({cart.items.length})
        </button>
        <button onClick={() => setTab('saved')} className={`text-xs font-bold rounded-xl px-3 py-2 transition-colors ${tab === 'saved' ? 'bg-brand-600 text-white' : 'bg-white/60 text-[#33475b]'}`}>
          Saved for later ({cart.saved.length})
        </button>
      </div>

      {tab === 'saved' ? (
        <SavedForLaterList
          saved={cart.saved}
          onMoveToCart={(id) => cart.setSavedFlag(id, false)}
          onRemove={cart.remove}
        />
      ) : cart.groups.length === 0 && checkout.step !== 5 ? (
        <EmptyState icon={FiShoppingBag} title="Your cart is empty" description="Browse the medicine store to add items." />
      ) : (
        <div>
          <CheckoutStepper step={checkout.step} />

          <AnimatePresence mode="wait">
            <motion.div key={checkout.step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
              {checkout.step === 1 && (
                <AddressStep form={checkout.form} onChange={checkout.updateForm} />
              )}

              {checkout.step === 2 && (
                <PrescriptionStep
                  groups={cart.groups}
                  rxFiles={checkout.rxFiles}
                  onFileSelected={checkout.setRxFileForStore}
                  onError={checkout.setError}
                />
              )}

              {checkout.step === 3 && (
                <SummaryStep
                  groups={cart.groups}
                  coupons={cart.coupons}
                  couponInput={cart.couponInput}
                  grandTotal={cart.grandTotal}
                  form={checkout.form}
                  onUpdateQty={cart.updateQty}
                  onSaveForLater={(id) => cart.setSavedFlag(id, true)}
                  onRemove={cart.remove}
                  onCouponInputChange={cart.setCouponInputForStore}
                  onApplyCoupon={cart.applyCoupon}
                  onRemoveCoupon={cart.removeCoupon}
                />
              )}

              {checkout.step === 4 && (
                <PaymentStep
                  paymentMethod={checkout.form.payment_method}
                  onChangeMethod={(payment_method) => checkout.updateForm({ payment_method })}
                  grandTotal={cart.grandTotal}
                  error={checkout.error}
                  placing={checkout.placing}
                  orderCount={cart.groups.length}
                  onPlaceOrders={checkout.placeOrders}
                />
              )}

              {checkout.step === 5 && (
                <ConfirmationStep
                  placedOrderIds={checkout.placedOrderIds}
                  onContinueShopping={() => navigate('/app/store/medicines')}
                  onTrackOrders={() => navigate('/app/store/orders')}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {checkout.step < 5 && (
            <div className="max-w-md mx-auto flex gap-2 mt-4">
              {checkout.step > 1 && <button onClick={checkout.goBack} className="btn-ghost flex-1">Back</button>}
              {checkout.step < 4 && <button onClick={checkout.goNext} className="btn-primary flex-1">Continue</button>}
            </div>
          )}
          {checkout.step !== 4 && checkout.error && checkout.step < 4 && (
            <p className="text-rose-500 text-xs font-semibold mt-3 text-center" role="alert">{checkout.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
