import { useState, useEffect, useCallback } from 'react';

import { FileText, Link2, Receipt, CheckCircle } from 'lucide-react';

import Modal from '../Modal';

import {

  getDocument,

  getBusinessDocument,

  linkDocument,

  linkBusinessDocument,

  createBillFromOcr,

  confirmPaystubFromDocument,

} from '../../services/api';

import { useBudget } from '../../context/BudgetContext';

import { useToast } from '../Toast';

import DateInput from '../DateInput';

import { formatApiError } from '../../utils/formatApiError';



function applyParsedToForms(data, setPaystubForm, setBillForm) {

  const p = data?.parsed_json || {};

  setPaystubForm({

    source_name: p.employer_name || '',

    pay_date: p.pay_date || new Date().toISOString().split('T')[0],

    net_amount: p.net_amount || p.net_pay || '',

    gross_amount: p.gross_amount || p.gross_pay || '',

    memo: '',

  });

  setBillForm({

    name: p.vendor_name || data?.original_filename || '',

    amount: p.amount || '',

    due_date: p.due_date || '',

  });

}



function parseMoney(value) {

  const n = parseFloat(String(value).replace(/,/g, ''));

  return Number.isFinite(n) && n > 0 ? n : null;

}



export default function DocumentDetailDrawer({

  documentId,

  initialDoc = null,

  scope = 'personal',

  onClose,

  onUpdated,

  linkTarget,

}) {

  const { activeBudget } = useBudget();

  const toast = useToast();

  const [doc, setDoc] = useState(initialDoc);

  const [loading, setLoading] = useState(!initialDoc);

  const [busy, setBusy] = useState(false);

  const [paystubForm, setPaystubForm] = useState({

    source_name: '',

    pay_date: new Date().toISOString().split('T')[0],

    net_amount: '',

    gross_amount: '',

    memo: '',

  });

  const [billForm, setBillForm] = useState({ name: '', amount: '', due_date: '' });



  const fetchDoc = useCallback(async () => {

    if (!documentId) return;

    setLoading(true);

    try {

      const { data } =

        scope === 'business'

          ? await getBusinessDocument(documentId)

          : await getDocument(documentId);

      setDoc(data);

      applyParsedToForms(data, setPaystubForm, setBillForm);

    } catch (err) {

      toast(formatApiError(err), 'error');

      onClose?.();

    } finally {

      setLoading(false);

    }

  }, [documentId, scope, onClose, toast]);



  useEffect(() => {

    if (initialDoc) {

      setDoc(initialDoc);

      applyParsedToForms(initialDoc, setPaystubForm, setBillForm);

    }

    fetchDoc();

  }, [fetchDoc, initialDoc]);



  const handleLink = async () => {

    if (!linkTarget?.entity_type || !linkTarget?.entity_id) return;

    setBusy(true);

    try {

      const fn = scope === 'business' ? linkBusinessDocument : linkDocument;

      await fn(documentId, linkTarget);

      toast('Document linked');

      onUpdated?.();

      onClose?.();

    } catch (err) {

      toast(formatApiError(err), 'error');

    } finally {

      setBusy(false);

    }

  };



  const handleCreateBill = async () => {

    const amount = parseMoney(billForm.amount);

    if (!amount) {

      toast('Enter a valid bill amount', 'error');

      return;

    }

    setBusy(true);

    try {

      await createBillFromOcr(documentId, {

        name: billForm.name?.trim() || undefined,

        amount,

        due_date: billForm.due_date || undefined,

        budget_id: activeBudget?.id,

      });

      toast('Bill created from receipt');

      onUpdated?.();

      onClose?.();

    } catch (err) {

      toast(formatApiError(err), 'error');

    } finally {

      setBusy(false);

    }

  };



  const handleConfirmPaystub = async () => {

    const net = parseMoney(paystubForm.net_amount);

    if (!paystubForm.source_name?.trim() || !net) {

      toast('Employer and a valid net pay amount are required', 'error');

      return;

    }

    const gross = paystubForm.gross_amount

      ? parseMoney(paystubForm.gross_amount)

      : null;

    setBusy(true);

    try {

      await confirmPaystubFromDocument(documentId, {

        source_name: paystubForm.source_name.trim(),

        pay_date: paystubForm.pay_date,

        net_amount: net,

        gross_amount: gross,

        memo: paystubForm.memo?.trim() || null,

        budget_id: activeBudget?.id,

      });

      toast('Paycheck entry added');

      onUpdated?.();

      onClose?.();

    } catch (err) {

      toast(formatApiError(err), 'error');

    } finally {

      setBusy(false);

    }

  };



  if (!documentId) return null;



  const parsed = doc?.parsed_json || {};

  const isPaystub = doc?.document_type === 'paystub';

  const isReceipt = doc?.document_type === 'receipt';

  const alreadyLinked = Boolean(doc?.linked_entity_type && doc?.linked_entity_id);

  const linkedLabel =

    doc?.linked_entity_type === 'paycheck_entry'

      ? 'paycheck entry'

      : doc?.linked_entity_type === 'bill'

        ? 'bill'

        : doc?.linked_entity_type === 'tax_deduction'

          ? 'tax deduction'

          : doc?.linked_entity_type === 'business_deduction'

            ? 'deduction'

            : doc?.linked_entity_type || 'record';



  return (

    <Modal

      isOpen

      onClose={onClose}

      title={doc?.original_filename || 'Document details'}

    >

      {loading && !doc ? (

        <p className="text-sm text-gray-500">Loading…</p>

      ) : (

        <div className="space-y-4">

          {doc?.status === 'failed' && doc?.error_message && (

            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">

              {doc.error_message}

            </p>

          )}



          {alreadyLinked && (

            <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-2">

              <CheckCircle className="h-4 w-4 shrink-0" />

              Linked to {linkedLabel}

            </div>

          )}



          {doc?.download_url && (

            <a

              href={doc.download_url}

              target="_blank"

              rel="noopener noreferrer"

              className="text-sm text-blue-600 hover:underline"

            >

              Open / download file

            </a>

          )}



          {Object.keys(parsed).length > 0 && (

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">

              <p className="font-medium text-gray-700">Extracted fields</p>

              {Object.entries(parsed).map(([k, v]) =>

                v != null && k !== 'confidence' && k !== 'document_kind' ? (

                  <div key={k} className="flex justify-between gap-2">

                    <span className="text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>

                    <span className="text-gray-900 font-medium">{String(v)}</span>

                  </div>

                ) : null

              )}

            </div>

          )}



          {linkTarget && !alreadyLinked && (

            <button

              type="button"

              disabled={busy}

              onClick={handleLink}

              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50"

            >

              <Link2 className="h-4 w-4" />

              Link to record

            </button>

          )}



          {isReceipt && scope === 'personal' && !alreadyLinked && (

            <div className="border-t pt-4 space-y-3">

              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">

                <Receipt className="h-4 w-4" /> Create bill from receipt

              </p>

              <input

                className="w-full border rounded-lg px-3 py-2 text-sm"

                placeholder="Bill name"

                value={billForm.name}

                onChange={(e) => setBillForm((f) => ({ ...f, name: e.target.value }))}

              />

              <input

                className="w-full border rounded-lg px-3 py-2 text-sm"

                placeholder="Amount"

                type="number"

                step="0.01"

                min="0"

                value={billForm.amount}

                onChange={(e) => setBillForm((f) => ({ ...f, amount: e.target.value }))}

              />

              <DateInput

                label="Due date"

                value={billForm.due_date}

                onChange={(v) => setBillForm((f) => ({ ...f, due_date: v }))}

              />

              <button

                type="button"

                disabled={busy}

                onClick={handleCreateBill}

                className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50"

              >

                Create bill

              </button>

            </div>

          )}



          {isPaystub && scope === 'personal' && !alreadyLinked && (

            <div className="border-t pt-4 space-y-3">

              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">

                <FileText className="h-4 w-4" /> Add to income (paycheck entry)

              </p>

              <input

                className="w-full border rounded-lg px-3 py-2 text-sm"

                placeholder="Employer / source name"

                value={paystubForm.source_name}

                onChange={(e) => setPaystubForm((f) => ({ ...f, source_name: e.target.value }))}

              />

              <DateInput

                label="Pay date"

                value={paystubForm.pay_date}

                onChange={(v) => setPaystubForm((f) => ({ ...f, pay_date: v }))}

              />

              <div className="grid grid-cols-2 gap-2">

                <input

                  className="border rounded-lg px-3 py-2 text-sm"

                  placeholder="Net pay"

                  type="number"

                  step="0.01"

                  min="0"

                  value={paystubForm.net_amount}

                  onChange={(e) => setPaystubForm((f) => ({ ...f, net_amount: e.target.value }))}

                />

                <input

                  className="border rounded-lg px-3 py-2 text-sm"

                  placeholder="Gross (optional)"

                  type="number"

                  step="0.01"

                  min="0"

                  value={paystubForm.gross_amount}

                  onChange={(e) => setPaystubForm((f) => ({ ...f, gross_amount: e.target.value }))}

                />

              </div>

              <button

                type="button"

                disabled={busy}

                onClick={handleConfirmPaystub}

                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50"

              >

                Confirm paycheck entry

              </button>

            </div>

          )}

        </div>

      )}

    </Modal>

  );

}


