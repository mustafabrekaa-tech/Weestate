-- Trigger functions are never called through the API.
revoke execute on function public.handle_new_user(), public.pc_before_insert(), public.pc_after_insert(), public.profiles_guard() from public, anon, authenticated;
-- Policy helpers: signed-in users need them for row-level security; visitors do not.
revoke execute on function public.my_department(), public.is_admin(), public.in_department(variadic text[]) from public, anon;
grant execute on function public.my_department(), public.is_admin(), public.in_department(variadic text[]) to authenticated;
