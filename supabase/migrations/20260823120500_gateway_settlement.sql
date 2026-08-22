-- =============================================================================
-- Gateway-verified settlement.
--
-- confirm_payment requires a signed-in staff member, which is right for the UPI
-- flow where a human asserts the money arrived. A payment gateway webhook has
-- no session and no staff member - its authority comes from a signature this
-- database cannot check. So the verification happens in the Edge Function, and
-- this function is granted to service_role only, never to anon or authenticated.
--
-- Keeping it separate from confirm_payment is deliberate: the ledger must be
-- able to tell apart a payment a gateway proved and one a person vouched for.
-- =============================================================================

create or replace function public.settle_payment_by_gateway(
  p_ticket_code text,
  p_payment_ref text,
  p_provider    text default 'razorpay'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'No such pass.');
  end if;

  -- Webhooks are retried, sometimes many times. Settling twice must be a no-op,
  -- not a second payment or an error the gateway keeps retrying.
  if v_tx.status = 'paid' then
    return jsonb_build_object('success', true, 'alreadySettled', true,
      'ticketCode', v_tx.ticket_code);
  end if;

  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false,
      'message', 'A ' || v_tx.status || ' pass cannot be settled.');
  end if;

  update public.transactions
     set status = 'paid',
         payment_ref = coalesce(nullif(trim(coalesce(p_payment_ref, '')), ''), payment_ref),
         payment_provider = p_provider,
         payment_verified_at = now(),
         -- Deliberately null: no person vouched for this one, the gateway did.
         payment_verified_by = null
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'alreadySettled', false,
    'ticketCode', v_tx.ticket_code);
end;
$$;

revoke all on function public.settle_payment_by_gateway(text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_payment_by_gateway(text, text, text) to service_role;

-- Read-only lookup for the order-creation endpoint: it must price the order
-- from the database, never from the browser, or a customer could pay one rupee
-- for any pass.
create or replace function public.gateway_order_context(p_ticket_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
  v_m  public.merchants%rowtype;
begin
  select * into v_tx from public.transactions t
   where upper(t.ticket_code) = upper(trim(p_ticket_code));
  if not found then
    return jsonb_build_object('success', false, 'message', 'No such pass.');
  end if;
  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false, 'message', 'This pass is not awaiting payment.');
  end if;

  select * into v_m from public.merchants m where m.id = v_tx.merchant_id;

  return jsonb_build_object(
    'success', true,
    'ticketCode', v_tx.ticket_code,
    'amount', v_tx.amount,
    'currency', v_m.currency,
    'businessName', v_m.business_name,
    'customerPhone', v_tx.customer_phone,
    'description', v_tx.ticket_type_label
  );
end;
$$;

revoke all on function public.gateway_order_context(text) from public, anon, authenticated;
grant execute on function public.gateway_order_context(text) to service_role;
