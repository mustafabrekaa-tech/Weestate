-- TRIO masterplan on the satellite: from the site boundary and phase centres used in the drone flythrough (site turned 32.6 deg clockwise from east).
update public.projects set plan_geo = '{"lng":31.604584,"lat":30.056506,"mpp":0.1908,"rot":32.6}'::jsonb where id = '11111111-0000-0000-0000-000000000001' and plan_geo is null;
