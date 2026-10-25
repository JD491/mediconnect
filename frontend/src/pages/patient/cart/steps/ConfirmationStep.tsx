import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiPrinter, FiShoppingBag, FiAlertTriangle } from 'react-icons/fi';
import { supabase } from '../../../../lib/supabaseClient';
import { printGstInvoice } from '../../../../lib/payments';
import { PAYMENT_STATUS_LABELS } from '../../../../lib/orderStatus';
import type { Database } from '../../../../types/database.types';
import type { OrderItemWithMedicine } from '../../../../types/orders';
import type { CheckoutPaymentError } from '../../../../hooks/useCheckout';

type OrderRow = Database['public']['Tables']['orders']['Row'];

interface ConfirmationOrder extends OrderRow {
  store: { store_name: string } | null;
}

interface ConfirmationStepProps {
  placedOrderIds: number[];
  paymentErrors: CheckoutPaymentError[];
  onContinueShopping: () => void;
  onTrackOrders: () => void;
}

export default function ConfirmationStep({ placedOrderIds, paymentErrors, onContinueShopping, onTrackOrders }: ConfirmationStepProps) {
  const [orders, setOrders] = useState<ConfirmationOrder[]>([]);
  const [items, setItems] = useState<OrderItemWithMedicine[]>([]);

  useEffect(() => {
    if (placedOrderIds.length === 0) return;
    (async () => {
      const [ordersRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('*, store:stores(store_name)').in('order_id', placedOrderIds),
        supabase.from('order_items').select('*, medicine:medicines(name, image_url, form, gst_rate)').in('order_id', placedOrderIds),
      ]);
      setOrders((ordersRes.data ?? []) as unknown as ConfirmationOrder[]);
      setItems((itemsRes.data ?? []) as unknown as OrderItemWithMedicine[]);
    })();
  }, [placedOrderIds]);

  const printInvoice = (order: ConfirmationOrder) => {
    printGstInvoice({
      orderId: order.order_id,
      storeName: order.store?.store_name ?? 'MediConnect Pharmacy',
      customerName: order.customer_name ?? 'Customer',
      address: order.delivery_address,
      createdAt: order.created_at,
      items: items.filter((i) => i.order_id === order.order_id).map((i) => ({
        name: i.medicine?.name ?? 'Medicine', quantity: i.quantity, price: i.price, gstRate: i.medicine?.gst_rate ?? 12,
      })),
      deliveryFee: Number(order.delivery_fee),
      discount: Number(order.discount_amount),
      total: Number(order.total_amount),
      paymentMethod: order.payment_method, paymentStatus: order.payment_status,
      paymentRef: order.payment_ref, pickupToken: order.pickup_token,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card max-w-lg mx-auto">
      <div className="text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <FiCheck size={24} />
        </motion.div>
        <h3 className="font-extrabold text-[#0f2340] text-lg mb-1">Order{placedOrderIds.length > 1 ? 's' : ''} Confirmed!</h3>
        <p className="text-sm text-[#5b7088] mb-4">
          {placedOrderIds.length > 1 ? `Orders #${placedOrderIds.join(', #')} have` : `Order #${placedOrderIds[0]} has`} been placed successfully.
        </p>
      </div>

      <div className="space-y-2 mb-4">
        {orders.map((order) => {
          const error = paymentErrors.find((e) => e.orderId === order.order_id);
          return (
            <div key={order.order_id} className="p-3 rounded-xl bg-white/60 border border-white/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#0f2340]">{order.store?.store_name ?? `Order #${order.order_id}`}</p>
                <span className="text-xs font-bold text-[#33475b]">₹{Number(order.total_amount).toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-[#5b7088] mt-0.5">
                #{order.order_id} · {PAYMENT_STATUS_LABELS[order.payment_status]} · {order.payment_method.replaceAll('_', ' ')}
              </p>
              {order.pickup_token && (
                <p className="text-[11px] font-bold text-brand-700 mt-1 flex items-center gap-1">
                  <FiShoppingBag /> Pickup token <span className="font-mono text-sm">{order.pickup_token}</span>
                </p>
              )}
              {order.payment_ref && <p className="text-[10px] text-[#8a9bb0] mt-0.5 break-all">Ref {order.payment_ref}</p>}
              {error && (
                <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-start gap-1">
                  <FiAlertTriangle className="mt-0.5 shrink-0" /> {error.message} Retry from My Orders or switch to COD.
                </p>
              )}
              <button onClick={() => printInvoice(order)} className="btn-ghost !py-1 !px-2 !text-[11px] mt-2 flex items-center gap-1">
                <FiPrinter /> GST Invoice
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button onClick={onContinueShopping} className="btn-ghost flex-1">Continue Shopping</button>
        <button onClick={onTrackOrders} className="btn-primary flex-1">Track Orders</button>
      </div>
    </motion.div>
  );
}
