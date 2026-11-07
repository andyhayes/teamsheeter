-- Coaches can put a team's seasons in any order (lowest first). The first one is shown by default.

alter table seasons add column sort_order integer not null default 0;

-- Keep today's order: newest label first.
update seasons s set sort_order = o.n
from (select id, row_number() over (partition by team_id order by label desc) - 1 as n from seasons) o
where o.id = s.id;
