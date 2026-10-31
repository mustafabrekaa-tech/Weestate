-- Imports: when a cost code exists both as a WE-estate default and as the company's own, use the company's one
-- (it was matching both, which doubled budget lines and made BOQ imports fail), and take one row per code.
create or replace function public.import_rows(p_project uuid, p_kind text, p_rows jsonb, p_version uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  comp uuid := public.project_company(p_project);
  bud  uuid;
  n    int := 0;
  m    int := 0;
begin
  if not public.can_see_project(p_project) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'No rows to import'; end if;

  if p_kind = 'units' then
    if not public.in_department('pm', 'cost_control', 'sales') then raise exception 'Only PM, Cost control or Sales can import units'; end if;
    insert into public.units (project_id, phase_id, building_id, unit_type_id, code, unit_type, area_m2, floor, status, list_price_egp,
                              bedrooms, bathrooms, garden_m2, roof_m2, terrace_m2, view, orientation, finishing, delivery_date, notes)
    select distinct on (r.code) p_project, ph.id, b.id, ut.id, r.code, coalesce(r.unit_type, ut.name, ''), r.area_m2, r.floor,
           case when replace(lower(coalesce(r.status, '')), ' ', '_') in ('available', 'reserved', 'sold', 'ready', 'handed_over', 'blocked')
                then replace(lower(r.status), ' ', '_') else coalesce(ex.status, 'available') end, r.list_price_egp,
           coalesce(r.bedrooms, ut.bedrooms), r.bathrooms, r.garden_m2, r.roof_m2, r.terrace_m2,
           coalesce(r.view, ''), coalesce(r.orientation, ''), coalesce(r.finishing, ''), r.delivery_date, coalesce(r.notes, '')
      from jsonb_to_recordset(p_rows) as r(code text, phase text, building text, unit_type text, area_m2 numeric, floor int, status text,
                                           list_price_egp numeric, bedrooms int, bathrooms int, garden_m2 numeric, roof_m2 numeric,
                                           terrace_m2 numeric, view text, orientation text, finishing text, delivery_date date, notes text)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.buildings b on b.project_id = p_project and b.code = r.building
      left join lateral (select x.id, x.name, x.bedrooms from public.unit_types x where x.project_id = p_project
                           and (x.code = r.unit_type or x.name = r.unit_type) order by (x.code = r.unit_type) desc limit 1) ut on true
      left join public.units ex on ex.project_id = p_project and ex.code = r.code
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set area_m2 = coalesce(excluded.area_m2, units.area_m2), status = excluded.status,
           list_price_egp = coalesce(excluded.list_price_egp, units.list_price_egp),
           unit_type = excluded.unit_type, unit_type_id = coalesce(excluded.unit_type_id, units.unit_type_id),
           phase_id = coalesce(excluded.phase_id, units.phase_id), building_id = coalesce(excluded.building_id, units.building_id),
           floor = coalesce(excluded.floor, units.floor), bedrooms = coalesce(excluded.bedrooms, units.bedrooms),
           bathrooms = coalesce(excluded.bathrooms, units.bathrooms), garden_m2 = coalesce(excluded.garden_m2, units.garden_m2),
           roof_m2 = coalesce(excluded.roof_m2, units.roof_m2), terrace_m2 = coalesce(excluded.terrace_m2, units.terrace_m2),
           view = excluded.view, orientation = excluded.orientation, finishing = excluded.finishing,
           delivery_date = coalesce(excluded.delivery_date, units.delivery_date), notes = excluded.notes;
    get diagnostics n = row_count;

  elsif p_kind = 'phases' then
    if not public.in_department('pm', 'cost_control') then raise exception 'Only PM or Cost control can import phases'; end if;
    insert into public.phases (project_id, code, name, budget_egp, start_date, finish_date)
    select distinct on (r.code) p_project, r.code, coalesce(r.name, r.code), coalesce(r.budget_egp, 0), r.start_date, r.finish_date
      from jsonb_to_recordset(p_rows) as r(code text, name text, budget_egp numeric, start_date date, finish_date date)
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set name = excluded.name, budget_egp = excluded.budget_egp,
           start_date = coalesce(excluded.start_date, phases.start_date), finish_date = coalesce(excluded.finish_date, phases.finish_date);
    get diagnostics n = row_count;

  elsif p_kind = 'buildings' then
    if not public.in_department('pm', 'cost_control', 'tech_office') then raise exception 'Only PM, Cost control or Technical office can import buildings'; end if;
    insert into public.buildings (project_id, phase_id, code, name, floors)
    select distinct on (r.code) p_project, ph.id, r.code, coalesce(r.name, r.code), r.floors
      from jsonb_to_recordset(p_rows) as r(code text, name text, phase text, floors int)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set name = excluded.name, floors = coalesce(excluded.floors, buildings.floors), phase_id = coalesce(excluded.phase_id, buildings.phase_id);
    get diagnostics n = row_count;

  elsif p_kind = 'unit_types' then
    if not public.in_department('pm', 'cost_control', 'sales') then raise exception 'Only PM, Cost control or Sales can import unit types'; end if;
    insert into public.unit_types (project_id, code, name, category, area_m2, bedrooms)
    select distinct on (r.code) p_project, r.code, coalesce(r.name, r.code),
           case when replace(lower(coalesce(r.category, '')), ' ', '_') in
                ('villa', 'townhouse', 'twin_house', 'apartment', 'duplex', 'penthouse', 'chalet', 'office', 'retail', 'clinic')
                then replace(lower(r.category), ' ', '_') else 'other' end,
           r.area_m2, r.bedrooms
      from jsonb_to_recordset(p_rows) as r(code text, name text, category text, area_m2 numeric, bedrooms int)
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set name = excluded.name, category = excluded.category, area_m2 = excluded.area_m2, bedrooms = excluded.bedrooms;
    get diagnostics n = row_count;

  elsif p_kind = 'cost_codes' then
    if not public.in_department('cost_control', 'finance') then raise exception 'Only Cost control or Finance can import cost codes'; end if;
    insert into public.cost_codes (company_id, code, parent_code, name, name_ar, sort)
    select distinct on (r.code) comp, r.code, nullif(r.parent_code, ''), coalesce(r.name, r.code), coalesce(r.name_ar, ''), row_number() over ()
      from jsonb_to_recordset(p_rows) as r(code text, parent_code text, name text, name_ar text)
     where coalesce(r.code, '') <> ''
    on conflict (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code) do update
       set name = excluded.name, name_ar = excluded.name_ar, parent_code = excluded.parent_code;
    get diagnostics n = row_count;

  elsif p_kind = 'boq' then
    if not public.in_department('tech_office', 'cost_control') then raise exception 'Only Technical office or Cost control can import the BOQ'; end if;
    insert into public.boq_items (project_id, phase_id, building_id, cost_code_id, section, code, description, unit, quantity, rate_egp, sort)
    select distinct on (r.code) p_project, ph.id, b.id, cc.id, coalesce(r.section, ''), r.code, r.description, coalesce(r.unit, ''),
           coalesce(r.quantity, 0), coalesce(r.rate_egp, 0), row_number() over ()
      from jsonb_to_recordset(p_rows) as r(code text, description text, unit text, quantity numeric, rate_egp numeric, section text,
                                           phase text, building text, cost_code text)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.buildings b on b.project_id = p_project and b.code = r.building
      left join lateral (select x.id from public.cost_codes x where x.code = r.cost_code and (x.company_id is null or x.company_id = comp)
                    order by x.company_id nulls last limit 1) cc on true
     where coalesce(r.code, '') <> '' and coalesce(r.description, '') <> ''
    on conflict (project_id, code) do update
       set description = excluded.description, unit = excluded.unit, quantity = excluded.quantity,
           rate_egp = excluded.rate_egp, section = excluded.section, cost_code_id = coalesce(excluded.cost_code_id, boq_items.cost_code_id),
           building_id = coalesce(excluded.building_id, boq_items.building_id);
    get diagnostics n = row_count;

  elsif p_kind = 'suppliers' then
    if not public.in_department('procurement', 'pm', 'facility') then raise exception 'Only Procurement, PM or Facility can import suppliers'; end if;
    insert into public.suppliers (company_id, name, name_ar, kind, trade, tax_id, commercial_reg, contact_name, phone, email, address,
                                  bank_name, iban, rating, notes)
    select distinct on (r.name) comp, r.name, coalesce(r.name_ar, ''),
           case when lower(coalesce(r.kind, '')) in ('contractor', 'supplier', 'consultant', 'facility') then lower(r.kind) else
             case when coalesce(r.kind, '') = '' then 'contractor' else 'other' end end,
           coalesce(r.trade, ''), coalesce(r.tax_id, ''), coalesce(r.commercial_reg, ''), coalesce(r.contact_name, ''),
           coalesce(r.phone, ''), coalesce(r.email, ''), coalesce(r.address, ''), coalesce(r.bank_name, ''), coalesce(r.iban, ''),
           case when r.rating between 1 and 5 then r.rating end, coalesce(r.notes, '')
      from jsonb_to_recordset(p_rows) as r(name text, name_ar text, kind text, trade text, tax_id text, commercial_reg text, contact_name text,
                                           phone text, email text, address text, bank_name text, iban text, rating int, notes text)
     where coalesce(r.name, '') <> ''
    on conflict (company_id, name) do update
       set kind = excluded.kind, trade = excluded.trade, tax_id = excluded.tax_id, commercial_reg = excluded.commercial_reg,
           contact_name = excluded.contact_name, phone = excluded.phone, email = excluded.email, address = excluded.address,
           bank_name = excluded.bank_name, iban = excluded.iban, rating = coalesce(excluded.rating, suppliers.rating), notes = excluded.notes;
    get diagnostics n = row_count;

  elsif p_kind = 'contracts' then
    if not public.in_department('procurement', 'pm') then raise exception 'Only Procurement or PM can import contracts'; end if;
    insert into public.suppliers (company_id, name)
    select distinct comp, r.contractor from jsonb_to_recordset(p_rows) as r(contractor text)
     where coalesce(r.contractor, '') <> ''
    on conflict (company_id, name) do nothing;
    insert into public.contracts (project_id, phase_id, code, contractor, supplier_id, scope, value_egp, retention_pct, advance_pct,
                                  start_date, finish_date, signed_on, cost_code_id, kind, status, contact_name, contact_phone, contact_email,
                                  payment_terms, performance_bond_pct, defects_months, insurance, vat_pct, notes)
    select distinct on (r.code) p_project, ph.id, r.code, r.contractor, s.id, coalesce(r.scope, ''), coalesce(r.value_egp, 0),
           coalesce(r.retention_pct, 5), coalesce(r.advance_pct, 0), r.start_date, r.finish_date, r.signed_on, cc.id,
           case when lower(coalesce(r.kind, '')) in ('main', 'subcontract', 'supply', 'consultancy', 'facility') then lower(r.kind) else
             case when coalesce(r.kind, '') = '' then 'main' else 'other' end end,
           case when lower(coalesce(r.status, '')) in ('draft', 'active', 'completed', 'closed', 'terminated') then lower(r.status) else 'active' end,
           coalesce(r.contact_name, ''), coalesce(r.contact_phone, ''), coalesce(r.contact_email, ''), coalesce(r.payment_terms, ''),
           r.performance_bond_pct, r.defects_months, coalesce(r.insurance, ''), r.vat_pct, coalesce(r.notes, '')
      from jsonb_to_recordset(p_rows) as r(code text, contractor text, scope text, value_egp numeric, retention_pct numeric,
                                           advance_pct numeric, start_date date, finish_date date, signed_on date, phase text, cost_code text,
                                           kind text, status text, contact_name text, contact_phone text, contact_email text, payment_terms text,
                                           performance_bond_pct numeric, defects_months int, insurance text, vat_pct numeric, notes text)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.suppliers s on s.company_id = comp and s.name = r.contractor
      left join lateral (select x.id from public.cost_codes x where x.code = r.cost_code and (x.company_id is null or x.company_id = comp)
                    order by x.company_id nulls last limit 1) cc on true
     where coalesce(r.code, '') <> ''
    on conflict (project_id, code) do update
       set value_egp = excluded.value_egp, scope = excluded.scope, retention_pct = excluded.retention_pct,
           advance_pct = excluded.advance_pct, start_date = coalesce(excluded.start_date, contracts.start_date),
           finish_date = coalesce(excluded.finish_date, contracts.finish_date), signed_on = coalesce(excluded.signed_on, contracts.signed_on),
           kind = excluded.kind, status = excluded.status, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
           contact_email = excluded.contact_email, payment_terms = excluded.payment_terms,
           performance_bond_pct = coalesce(excluded.performance_bond_pct, contracts.performance_bond_pct),
           defects_months = coalesce(excluded.defects_months, contracts.defects_months), insurance = excluded.insurance,
           vat_pct = coalesce(excluded.vat_pct, contracts.vat_pct), notes = excluded.notes;
    get diagnostics n = row_count;

  elsif p_kind = 'payments' then
    if not public.in_department('finance') then raise exception 'Only Finance can import payments'; end if;
    insert into public.payments_out (project_id, supplier_id, cost_code_id, amount_egp, paid_on, reference)
    select p_project, coalesce(s.id, c.supplier_id), coalesce(cc.id, c.cost_code_id), r.amount_egp, coalesce(r.paid_on, current_date),
           concat_ws(' ', nullif(r.reference, ''), case when c.code is not null then '(' || c.code || ')' end)
      from jsonb_to_recordset(p_rows) as r(contract text, supplier text, cost_code text, amount_egp numeric, paid_on date, reference text)
      left join public.contracts c on c.project_id = p_project and c.code = r.contract
      left join public.suppliers s on s.company_id = comp and s.name = r.supplier
      left join lateral (select x.id from public.cost_codes x where x.code = r.cost_code and (x.company_id is null or x.company_id = comp)
                    order by x.company_id nulls last limit 1) cc on true
     where r.amount_egp is not null;
    get diagnostics n = row_count;

  elsif p_kind = 'budget' then
    if not public.in_department('cost_control', 'finance') then raise exception 'Only Cost control or Finance can import the budget'; end if;
    select id into bud from public.budgets where project_id = p_project and status <> 'superseded' order by version desc limit 1;
    if bud is null then
      insert into public.budgets (project_id) values (p_project) returning id into bud;
    end if;
    insert into public.budget_lines (project_id, budget_id, phase_id, cost_code_id, amount_egp, note)
    select distinct on (ph.id, cc.id) p_project, bud, ph.id, cc.id, coalesce(r.amount_egp, 0), coalesce(r.note, '')
      from jsonb_to_recordset(p_rows) as r(cost_code text, phase text, amount_egp numeric, note text)
      join lateral (select x.id from public.cost_codes x where x.code = r.cost_code and (x.company_id is null or x.company_id = comp)
                    order by x.company_id nulls last limit 1) cc on true
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
    on conflict (budget_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid), cost_code_id)
    do update set amount_egp = excluded.amount_egp, note = excluded.note;
    get diagnostics n = row_count;

  elsif p_kind = 'activities' then
    if not public.in_department('cost_control', 'pm') then raise exception 'Only Cost control or PM can import the schedule'; end if;
    if p_version is null then
      insert into public.schedule_versions (project_id, name, is_baseline, source)
      values (p_project, 'Baseline', not exists (select 1 from public.schedule_versions where project_id = p_project and is_baseline), 'excel')
      returning id into p_version;
    end if;
    insert into public.activities (project_id, version_id, code, name, wbs, phase_id, building_id, start_date, finish_date, is_milestone, weight)
    select distinct on (r.code) p_project, p_version, r.code, r.name, coalesce(r.wbs, ''), ph.id, b.id, r.start_date, r.finish_date,
           coalesce(r.is_milestone, r.start_date = r.finish_date, false), coalesce(r.weight, 1)
      from jsonb_to_recordset(p_rows) as r(code text, name text, wbs text, phase text, building text, start_date date, finish_date date,
                                           is_milestone boolean, weight numeric)
      left join public.phases ph on ph.project_id = p_project and ph.code = r.phase
      left join public.buildings b on b.project_id = p_project and b.code = r.building
     where coalesce(r.code, '') <> ''
    on conflict (version_id, code) do update
       set name = excluded.name, start_date = excluded.start_date, finish_date = excluded.finish_date, weight = excluded.weight,
           wbs = excluded.wbs, phase_id = coalesce(excluded.phase_id, activities.phase_id);
    get diagnostics n = row_count;

  elsif p_kind = 'progress' then
    if not public.in_department('cost_control', 'pm', 'site') then raise exception 'Only Cost control, PM or Site can import progress'; end if;
    insert into public.activity_progress (project_id, activity_id, period, actual_pct, note)
    select distinct on (a.id, coalesce(r.period, current_date))
           p_project, a.id, coalesce(r.period, current_date), least(greatest(r.actual_pct, 0), 100), coalesce(r.note, '')
      from jsonb_to_recordset(p_rows) as r(code text, period date, actual_pct numeric, note text)
      join lateral (
        select act.id from public.activities act join public.schedule_versions v on v.id = act.version_id
         where act.project_id = p_project and act.code = r.code
         order by v.is_baseline desc, v.created_at limit 1
      ) a on true
     where r.actual_pct is not null
    on conflict (activity_id, period) do update set actual_pct = excluded.actual_pct, note = excluded.note;
    get diagnostics n = row_count;

  elsif p_kind = 'customers' then
    if not public.in_department('sales', 'handover', 'community') then raise exception 'Only Sales, Handover or Community can import customers'; end if;
    -- Update people already on file (same national ID), add the rest.
    update public.customers c
       set full_name = r.full_name, phone = coalesce(nullif(r.phone, ''), c.phone), phone2 = coalesce(r.phone2, c.phone2),
           email = coalesce(nullif(r.email, ''), c.email), address = coalesce(r.address, c.address),
           nationality = coalesce(r.nationality, c.nationality), birth_date = coalesce(r.birth_date, c.birth_date),
           occupation = coalesce(r.occupation, c.occupation), source = coalesce(r.source, c.source),
           broker = coalesce(r.broker, c.broker), notes = coalesce(r.notes, c.notes)
      from jsonb_to_recordset(p_rows) as r(full_name text, national_id text, phone text, phone2 text, email text, address text,
                                           nationality text, birth_date date, occupation text, source text, broker text, notes text)
     where c.company_id = comp and coalesce(r.national_id, '') <> '' and c.national_id = r.national_id;
    get diagnostics n = row_count;
    insert into public.customers (company_id, full_name, national_id, phone, phone2, email, address, nationality, birth_date,
                                  occupation, source, broker, notes)
    select comp, r.full_name, coalesce(r.national_id, ''), coalesce(r.phone, ''), coalesce(r.phone2, ''), coalesce(r.email, ''),
           coalesce(r.address, ''), coalesce(r.nationality, ''), r.birth_date, coalesce(r.occupation, ''), coalesce(r.source, ''),
           coalesce(r.broker, ''), coalesce(r.notes, '')
      from jsonb_to_recordset(p_rows) as r(full_name text, national_id text, phone text, phone2 text, email text, address text,
                                           nationality text, birth_date date, occupation text, source text, broker text, notes text)
     where coalesce(r.full_name, '') <> ''
       and not exists (select 1 from public.customers c where c.company_id = comp and coalesce(r.national_id, '') <> '' and c.national_id = r.national_id);
    get diagnostics m = row_count;
    n := n + m;

  elsif p_kind = 'assets' then
    if not public.in_department('facility', 'pm') then raise exception 'Only Facility or PM can import assets'; end if;
    insert into public.assets (project_id, building_id, unit_id, contract_id, category, tag, name, manufacturer, model, install_date, warranty_until)
    select distinct on (r.tag) p_project, b.id, u.id, c.id,
           case when lower(coalesce(r.category, '')) in ('lift', 'pump', 'generator', 'hvac', 'fire', 'electrical', 'irrigation', 'pool', 'landscape', 'security')
                then lower(r.category) else 'other' end,
           r.tag, coalesce(r.name, r.tag), coalesce(r.manufacturer, ''), coalesce(r.model, ''), r.install_date, r.warranty_until
      from jsonb_to_recordset(p_rows) as r(tag text, name text, category text, building text, unit text, contract text, manufacturer text,
                                           model text, install_date date, warranty_until date)
      left join public.buildings b on b.project_id = p_project and b.code = r.building
      left join public.units u on u.project_id = p_project and u.code = r.unit
      left join public.contracts c on c.project_id = p_project and c.code = r.contract
     where coalesce(r.tag, '') <> ''
    on conflict (project_id, tag) do update
       set name = excluded.name, category = excluded.category, manufacturer = excluded.manufacturer, model = excluded.model,
           install_date = coalesce(excluded.install_date, assets.install_date), warranty_until = coalesce(excluded.warranty_until, assets.warranty_until);
    get diagnostics n = row_count;

  else
    raise exception 'Unknown import %', p_kind;
  end if;
  return n;
end $$;
