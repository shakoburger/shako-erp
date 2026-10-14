import { z } from 'zod';

const text = z.string().trim().max(200);
const cashValue = z.number().finite().min(0).max(10000000000);
const recordSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['customer','account','cash','bank','employee','expense','service','visa','invoice','ticket']),
  name: text.min(1),
  code: text.max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3,8}$/).default('MULTI'),
  amount: cashValue.default(0),
  payload: z.object({
    accountType: z.enum(['customer','airline','supplier']).optional(),
    sellingPrice: cashValue.optional(),
    supplierPrice: cashValue.optional(),
    phone: text.optional(),
    email: text.optional(),
    address: text.optional(),
    creditLimit: cashValue.optional(),
    creditLimits: z.record(cashValue).optional(),
    notes: z.string().max(2000).optional(),
    direction: z.enum(['receipt','payment']).optional(),
    customerId: z.string().uuid().optional(),
    treasuryId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    brokerId: z.string().uuid().optional(),
    brokerCommission: cashValue.optional(),
    airline: text.optional(),
    vendor: text.optional(),
    route: text.optional(),
    class: text.optional(),
    sign: text.optional(),
    fare: cashValue.optional(),
    commPct: z.number().min(0).max(100).optional(),
    commAmount: cashValue.optional(),
    discount: cashValue.optional(),
    discountPct: z.number().min(0).max(100).optional(),
    extraPct: z.number().min(0).max(100).optional(),
    extraComm: cashValue.optional(),
    payment: z.enum(['cash','bank','credit']).optional(),
    income: text.optional(),
    taxes: z.record(cashValue).optional(),
    flags: z.record(z.boolean()).optional(),
    status: z.enum(['active','refunded','cancelled']).optional(),
    penalties: cashValue.optional(),
    refundComm: cashValue.optional(),
    commissionAccountId: z.string().optional(),
    commissionAccountName: z.string().optional(),
    crossCurrency: z.boolean().optional(),
    settlementCurrency: z.string().optional(),
    settlementTreasuryId: z.string().optional(),
    settlementAmount: cashValue.optional(),
    conversionRate: z.number().optional(),
    passengers: z.array(z.object({name: z.string(), ticketNo: z.string()})).optional()
  }).passthrough()
}).strict();

// Test payload exactly as sent in Image 1:
const testPayload = {
  kind: 'service',
  name: 'تأمين سفر دولي',
  code: '0000019',
  date: '2026-10-07',
  currency: 'USD',
  amount: 450,
  payload: {
    receiptNumber: '0000019',
    serviceAccountId: '',
    serviceAccountName: 'تأمين سفر دولي',
    cost: 125,
    price: 150,
    quantity: 3,
    notes: 'لللللل',
    payment: 'credit',
    treasuryId: '',
    supplierId: '973c5a01-e8c3-422e-8f7e-5bd5ed4f8aed',
    supplierName: 'وكالة الأفق (مورد تجريبي)',
    discount: 0,
    commissionAccountId: '',
    commissionAccountName: '',
    exchangeRate: 1,
    brokerId: '',
    brokerName: '',
    brokerCommission: 0,
    flags: { Group: false, Broker: false },
    customerName: 'كيرلس',
    customerId: '96c30c5c-abe3-4630-aed2-8af736ea65d9'
  }
};

const result = recordSchema.safeParse(testPayload);
if (!result.success) {
  console.log('ZOD ERRORS:');
  console.log(JSON.stringify(result.error.issues, null, 2));
} else {
  console.log('ZOD VALIDATION SUCCEEDED!');
}
