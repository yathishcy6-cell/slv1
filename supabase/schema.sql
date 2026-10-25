-- Hunter System v0.2 schema
-- Run in Supabase SQL Editor. Review policies before public launch.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  level integer not null default 1 check (level >= 1),
  current_xp integer not null default 0 check (current_xp >= 0),
  total_xp bigint not null default 0 check (total_xp >= 0),
  gold_balance bigint not null default 0 check (gold_balance >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null check (category in ('strength','intelligence','discipline','creativity')),
  difficulty text not null check (difficulty in ('easy','normal','hard','dungeon')),
  xp_reward integer not null check (xp_reward between 0 and 150),
  gold_reward integer not null check (gold_reward between 0 and 50),
  is_dungeon boolean not null default false,
  status text not null default 'assigned' check (status in ('assigned','pending','completed','rejected','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.proof_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.user_quests(id) on delete cascade,
  evidence_path text not null,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Move a quest into pending review and prevent duplicate active/completed submissions.
create or replace function public.mark_quest_pending_on_proof()
returns trigger language plpgsql security definer set search_path=public
as $$
declare current_status text;
begin
  select status into current_status from public.user_quests
    where id=new.quest_id and user_id=new.user_id for update;
  if current_status is null then raise exception 'Quest not found for this user'; end if;
  if current_status not in ('assigned','rejected') then
    raise exception 'This quest is already pending or completed';
  end if;
  update public.user_quests set status='pending' where id=new.quest_id;
  return new;
end; $$;

drop trigger if exists proof_submission_marks_quest_pending on public.proof_submissions;
create trigger proof_submission_marks_quest_pending
before insert on public.proof_submissions
for each row execute procedure public.mark_quest_pending_on_proof();

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid references public.user_quests(id),
  submission_id uuid unique references public.proof_submissions(id),
  amount integer not null check (amount > 0),
  is_dungeon boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.gold_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid unique references public.proof_submissions(id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stat_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid references public.user_quests(id),
  category text not null,
  points integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.rank_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank_name text not null,
  level_unlocked integer not null,
  unlocked_at timestamptz not null default now(),
  unique(user_id, rank_name)
);

create index if not exists user_quests_user_status_idx on public.user_quests(user_id,status);
create index if not exists proof_submissions_user_created_idx on public.proof_submissions(user_id,created_at desc);
create index if not exists proof_submissions_status_created_idx on public.proof_submissions(status,created_at);
create index if not exists xp_ledger_user_created_idx on public.xp_ledger(user_id,created_at desc);


-- SECURITY DEFINER helper avoids recursive RLS checks when policies need admin status.
create or replace function public.is_hunter_admin()
returns boolean language sql stable security definer set search_path=public
as $$
  select coalesce((select is_admin from public.profiles where id=auth.uid()),false);
$$;
revoke all on function public.is_hunter_admin() from public;
grant execute on function public.is_hunter_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_quests enable row level security;
alter table public.proof_submissions enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.gold_ledger enable row level security;
alter table public.stat_events enable row level security;
alter table public.rank_history enable row level security;

create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_hunter_admin());
create policy "profile update own display name" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());
-- Restrict client-side updates to display_name only. XP, level, gold and admin role
-- must only be changed by trusted database functions.
revoke update on public.profiles from authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy "user read own quests or admin" on public.user_quests for select to authenticated
using (user_id = auth.uid() or public.is_hunter_admin());
create policy "user create own personal quests" on public.user_quests for insert to authenticated
with check (user_id = auth.uid() and is_dungeon = false and xp_reward <= 60 and gold_reward <= 12 and status='assigned');
create policy "user read own proof or admin" on public.proof_submissions for select to authenticated
using (user_id = auth.uid() or public.is_hunter_admin());
create policy "user submit proof for own quest" on public.proof_submissions for insert to authenticated
with check (
  user_id = auth.uid() and status='pending' and
  exists(select 1 from public.user_quests q where q.id=quest_id and q.user_id=auth.uid())
);
create policy "user read own xp ledger or admin" on public.xp_ledger for select to authenticated
using (user_id=auth.uid() or public.is_hunter_admin());
create policy "user read own gold ledger or admin" on public.gold_ledger for select to authenticated
using (user_id=auth.uid() or public.is_hunter_admin());
create policy "user read own stat events or admin" on public.stat_events for select to authenticated
using (user_id=auth.uid() or public.is_hunter_admin());
create policy "user read own rank history or admin" on public.rank_history for select to authenticated
using (user_id=auth.uid() or public.is_hunter_admin());

-- Private bucket. Storage policies limit evidence to the owning user or an admin.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('quest-evidence','quest-evidence',false,8388608,array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "evidence upload own folder" on storage.objects for insert to authenticated
with check (bucket_id='quest-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "evidence owner or admin read" on storage.objects for select to authenticated
using (bucket_id='quest-evidence' and (
  (storage.foldername(name))[1]=auth.uid()::text or
  public.is_hunter_admin()
));
create policy "evidence owner can delete own unsubmitted file" on storage.objects for delete to authenticated
using (bucket_id='quest-evidence' and (storage.foldername(name))[1]=auth.uid()::text);

-- New account profile. Username is based on email prefix; collisions get a UUID suffix.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare base_name text; chosen text;
begin
  base_name := lower(regexp_replace(split_part(coalesce(new.email,'hunter'), '@', 1), '[^a-z0-9_]', '', 'g'));
  if length(base_name)<3 then base_name := 'hunter'; end if;
  chosen := left(base_name,18);
  if exists(select 1 from public.profiles where username=chosen) then
    chosen := left(base_name,10) || '_' || substr(replace(new.id::text,'-',''),1,7);
  end if;
  insert into public.profiles(id,username,display_name) values(new.id,chosen,chosen);
  -- Seed a starter quest board for every new hunter. Quest IDs are real UUIDs,
  -- so proof_submissions can safely reference them.
  insert into public.user_quests(user_id,title,description,category,difficulty,xp_reward,gold_reward,is_dungeon,status)
  values
    (new.id,'Focused study session','Study one topic for 25 minutes, with a short break afterward.','intelligence','normal',45,8,false,'assigned'),
    (new.id,'Move with intent','Complete a safe workout, walk, or mobility session.','strength','normal',40,8,false,'assigned'),
    (new.id,'Set today’s priorities','Write three realistic priorities and choose the first action.','discipline','easy',20,4,false,'assigned'),
    (new.id,'Make tangible progress','Spend focused time on a project, design, or coding task.','creativity','hard',60,12,false,'assigned'),
    (new.id,'Read and summarize','Read for 15 minutes and write one thing you learned.','intelligence','easy',20,4,false,'assigned'),
    (new.id,'Intentional offline block','Choose a planned block away from entertainment feeds. Report honestly.','discipline','normal',35,6,false,'assigned'),
    (new.id,'DUNGEON: Deep Work Trial','A planned 3-hour study block with reasonable breaks. Upload a session log or other evidence.','intelligence','dungeon',120,25,true,'assigned'),
    (new.id,'DUNGEON: Feed-Free Evening','Set a realistic evening window away from social feeds. Optional screen-time summary can support your self-report.','discipline','dungeon',75,18,true,'assigned');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Server-side approval function. Only admins can approve; XP/gold issue atomically.
create or replace function public.review_quest_proof(p_submission_id uuid,p_approve boolean,p_admin_note text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare sub public.proof_submissions%rowtype;
declare quest public.user_quests%rowtype;
declare admin_ok boolean;
declare today_xp integer;
declare award integer;
declare new_level integer;
declare new_current_xp integer;
declare needed integer;
begin
  select is_admin into admin_ok from public.profiles where id=auth.uid();
  if coalesce(admin_ok,false) is not true then raise exception 'Admin permission required'; end if;

  select * into sub from public.proof_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if sub.status <> 'pending' then raise exception 'Submission already reviewed'; end if;
  select * into quest from public.user_quests where id=sub.quest_id for update;
  if not found then raise exception 'Quest not found'; end if;

  if not p_approve then
    update public.proof_submissions set status='rejected',admin_note=left(coalesce(p_admin_note,'Rejected'),1000),reviewed_by=auth.uid(),reviewed_at=now() where id=sub.id;
    update public.user_quests set status='rejected' where id=quest.id;
    return jsonb_build_object('status','rejected');
  end if;

  if not quest.is_dungeon then
    select coalesce(sum(amount),0)::integer into today_xp from public.xp_ledger
      where user_id=sub.user_id and is_dungeon=false and created_at >= date_trunc('day',now());
    award := least(quest.xp_reward, greatest(0,280-today_xp));
    if award <= 0 then raise exception 'Daily standard XP cap reached'; end if;
  else
    award := quest.xp_reward;
  end if;

  update public.proof_submissions set status='approved',admin_note=left(coalesce(p_admin_note,'Approved'),1000),reviewed_by=auth.uid(),reviewed_at=now() where id=sub.id;
  update public.user_quests set status='completed',completed_at=now() where id=quest.id;
  insert into public.xp_ledger(user_id,quest_id,submission_id,amount,is_dungeon)
    values(sub.user_id,quest.id,sub.id,award,quest.is_dungeon);
  insert into public.gold_ledger(user_id,submission_id,amount) values(sub.user_id,sub.id,quest.gold_reward);
  insert into public.stat_events(user_id,quest_id,category,points) values(sub.user_id,quest.id,quest.category,greatest(1,award/25));

  select level,current_xp into new_level,new_current_xp from public.profiles where id=sub.user_id for update;
  new_current_xp := new_current_xp + award;
  loop
    needed := round(130 + power(new_level::numeric,1.22)*24)::integer;
    exit when new_current_xp < needed;
    new_current_xp := new_current_xp-needed;
    new_level := new_level+1;
  end loop;
  update public.profiles set level=new_level,current_xp=new_current_xp,
    total_xp=total_xp+award,gold_balance=gold_balance+quest.gold_reward where id=sub.user_id;

  -- Record all newly crossed rank thresholds, not only the latest one.
  insert into public.rank_history(user_id,rank_name,level_unlocked)
  select sub.user_id,r.rank_name,r.level
  from (values
    ('E-00',1),('E-01',2),('E-02',3),('E-03',4),('E-04',5),
    ('D-00',6),('D-01',8),('D-02',10),('D-03',12),('D-04',14),
    ('C-00',16),('C-01',19),('C-02',22),('C-03',25),('C-04',28),
    ('B-00',31),('B-01',35),('B-02',39),('B-03',43),('B-04',47),
    ('A-00',51),('A-01',56),('A-02',61),('A-03',66),('A-04',71),
    ('S-00',76),('S-01',82),('S-02',88),('SS',94),('SSS',100)
  ) as r(rank_name,level)
  where r.level <= new_level
  on conflict(user_id,rank_name) do nothing;

  return jsonb_build_object('status','approved','xp_awarded',award,'level',new_level,'gold_awarded',quest.gold_reward);
end; $$;

revoke all on function public.review_quest_proof(uuid,boolean,text) from public;
grant execute on function public.review_quest_proof(uuid,boolean,text) to authenticated;

-- IMPORTANT ADMIN SETUP:
-- 1) Sign up your own account normally.
-- 2) In Supabase SQL Editor, run:
--    update public.profiles set is_admin=true where username='YOUR_USERNAME';
-- Do not provide end users with permission to update is_admin.
-- Before launch, add explicit column-level update privileges or a security-definer profile update function
-- so users cannot change level/current_xp/total_xp/gold_balance/is_admin via direct REST calls.
