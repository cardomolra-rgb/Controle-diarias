-- Controle de Diárias: estrutura inicial
-- Cada encarregado (usuário do Supabase Auth) só enxerga e altera os próprios dados.
-- Semanas fechadas ficam travadas pelo próprio banco: nenhuma presença, custo extra,
-- dia sem obra ou vale daquele período pode ser criado, alterado ou apagado.

-- ---------- função utilitária: updated_at ----------
create or replace function public.definir_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- obras ----------
create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  apagado boolean not null default false,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists obras_user_id_updated_at_idx on public.obras (user_id, updated_at);

-- ---------- pessoas (equipe de cada obra) ----------
create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  nome text not null check (char_length(nome) between 1 and 80),
  funcao text not null check (char_length(funcao) between 1 and 40),
  diaria numeric(10, 2) not null check (diaria > 0),
  ativo boolean not null default true,
  pago_ate date,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade
);
create index if not exists pessoas_obra_id_user_id_idx on public.pessoas (obra_id, user_id);
create index if not exists pessoas_user_id_updated_at_idx on public.pessoas (user_id, updated_at);

-- ---------- presenças (chamada do dia) ----------
create table if not exists public.presencas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  pessoa_id uuid not null,
  data date not null,
  tipo numeric(2, 1) check (tipo in (0, 0.5, 1)),
  diaria numeric(10, 2) not null check (diaria >= 0),
  updated_at timestamptz not null default now(),
  unique (pessoa_id, data),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade,
  foreign key (pessoa_id, user_id) references public.pessoas (id, user_id) on delete cascade
);
create index if not exists presencas_obra_id_user_id_data_idx on public.presencas (obra_id, user_id, data);
create index if not exists presencas_pessoa_id_user_id_idx on public.presencas (pessoa_id, user_id);
create index if not exists presencas_user_id_updated_at_idx on public.presencas (user_id, updated_at);

-- ---------- dias da obra (dia sem obra) ----------
create table if not exists public.dias_obra (
  obra_id uuid not null,
  data date not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parado_motivo text check (char_length(parado_motivo) between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (obra_id, data),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade
);
create index if not exists dias_obra_obra_id_user_id_idx on public.dias_obra (obra_id, user_id);
create index if not exists dias_obra_user_id_updated_at_idx on public.dias_obra (user_id, updated_at);

-- ---------- custos extras do dia ----------
create table if not exists public.extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  data date not null,
  categoria text not null check (categoria in ('Almoço', 'Combustível', 'Material', 'Transporte', 'Ferramenta', 'Outro')),
  descricao text not null default '' check (char_length(descricao) <= 80),
  valor numeric(10, 2) not null check (valor > 0),
  apagado boolean not null default false,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade
);
create index if not exists extras_obra_id_user_id_data_idx on public.extras (obra_id, user_id, data);
create index if not exists extras_user_id_updated_at_idx on public.extras (user_id, updated_at);

-- ---------- pagamentos ----------
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  pessoa_id uuid not null,
  bruto numeric(10, 2) not null check (bruto >= 0),
  vales numeric(10, 2) not null default 0 check (vales >= 0),
  valor numeric(10, 2) not null check (valor >= 0),
  dias numeric(6, 1) not null check (dias >= 0),
  de date not null,
  ate date not null check (ate >= de),
  data date not null,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade,
  foreign key (pessoa_id, user_id) references public.pessoas (id, user_id) on delete cascade
);
create index if not exists pagamentos_obra_id_user_id_idx on public.pagamentos (obra_id, user_id);
create index if not exists pagamentos_pessoa_id_user_id_idx on public.pagamentos (pessoa_id, user_id);
create index if not exists pagamentos_user_id_updated_at_idx on public.pagamentos (user_id, updated_at);

-- ---------- vales / adiantamentos ----------
create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  pessoa_id uuid not null,
  data date not null,
  valor numeric(10, 2) not null check (valor > 0),
  obs text not null default '' check (char_length(obs) <= 60),
  pagamento_id uuid,
  apagado boolean not null default false,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade,
  foreign key (pessoa_id, user_id) references public.pessoas (id, user_id) on delete cascade,
  foreign key (pagamento_id, user_id) references public.pagamentos (id, user_id)
);
create index if not exists vales_obra_id_user_id_idx on public.vales (obra_id, user_id);
create index if not exists vales_pessoa_id_user_id_idx on public.vales (pessoa_id, user_id);
create index if not exists vales_pagamento_id_user_id_idx on public.vales (pagamento_id, user_id);
create index if not exists vales_user_id_updated_at_idx on public.vales (user_id, updated_at);

-- ---------- semanas fechadas ----------
create table if not exists public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  obra_id uuid not null,
  inicio date not null check (extract(isodow from inicio) = 1),
  fim date not null,
  fechado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim = inicio + 6),
  unique (obra_id, inicio),
  foreign key (obra_id, user_id) references public.obras (id, user_id) on delete cascade
);
create index if not exists fechamentos_obra_id_user_id_idx on public.fechamentos (obra_id, user_id, inicio, fim);
create index if not exists fechamentos_user_id_updated_at_idx on public.fechamentos (user_id, updated_at);

-- ---------- trava: semana fechada e dia já pago ----------
create or replace function public.semana_fechada(p_obra_id uuid, p_data date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.fechamentos f
    where f.obra_id = p_obra_id and p_data between f.inicio and f.fim
  );
$$;

create or replace function public.verificar_periodo_aberto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  so_pagamento boolean := false;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'vales' and tg_op = 'UPDATE' then
    if (new.obra_id, new.pessoa_id, new.data, new.valor, new.obs, new.apagado)
       is not distinct from (old.obra_id, old.pessoa_id, old.data, old.valor, old.obs, old.apagado) then
      so_pagamento := true;
    end if;
  end if;

  if not so_pagamento then
    if tg_op in ('UPDATE', 'DELETE') and public.semana_fechada(old.obra_id, old.data) then
      raise exception 'semana_fechada' using errcode = 'P0001',
        hint = 'Esta semana já foi fechada e não pode ser alterada.';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and public.semana_fechada(new.obra_id, new.data) then
      raise exception 'semana_fechada' using errcode = 'P0001',
        hint = 'Esta semana já foi fechada e não pode ser alterada.';
    end if;
  end if;

  if tg_table_name = 'presencas' and tg_op in ('UPDATE', 'DELETE') then
    if exists (select 1 from public.pessoas p where p.id = old.pessoa_id and p.pago_ate is not null and old.data <= p.pago_ate) then
      raise exception 'dia_pago' using errcode = 'P0001',
        hint = 'Este dia já foi pago e não pode ser alterado.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists presencas_periodo_aberto on public.presencas;
create trigger presencas_periodo_aberto before insert or update or delete on public.presencas
  for each row execute function public.verificar_periodo_aberto();

drop trigger if exists dias_obra_periodo_aberto on public.dias_obra;
create trigger dias_obra_periodo_aberto before insert or update or delete on public.dias_obra
  for each row execute function public.verificar_periodo_aberto();

drop trigger if exists extras_periodo_aberto on public.extras;
create trigger extras_periodo_aberto before insert or update or delete on public.extras
  for each row execute function public.verificar_periodo_aberto();

drop trigger if exists vales_periodo_aberto on public.vales;
create trigger vales_periodo_aberto before insert or update or delete on public.vales
  for each row execute function public.verificar_periodo_aberto();

-- fechamento só de semana que já começou
create or replace function public.verificar_fechamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.inicio > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'semana_futura' using errcode = 'P0001',
      hint = 'Só é possível fechar uma semana que já começou.';
  end if;
  return new;
end;
$$;

drop trigger if exists fechamentos_verificar on public.fechamentos;
create trigger fechamentos_verificar before insert on public.fechamentos
  for each row execute function public.verificar_fechamento();

-- updated_at automático
drop trigger if exists obras_updated_at on public.obras;
create trigger obras_updated_at before update on public.obras for each row execute function public.definir_updated_at();

drop trigger if exists pessoas_updated_at on public.pessoas;
create trigger pessoas_updated_at before update on public.pessoas for each row execute function public.definir_updated_at();

drop trigger if exists presencas_updated_at on public.presencas;
create trigger presencas_updated_at before update on public.presencas for each row execute function public.definir_updated_at();

drop trigger if exists dias_obra_updated_at on public.dias_obra;
create trigger dias_obra_updated_at before update on public.dias_obra for each row execute function public.definir_updated_at();

drop trigger if exists extras_updated_at on public.extras;
create trigger extras_updated_at before update on public.extras for each row execute function public.definir_updated_at();

drop trigger if exists pagamentos_updated_at on public.pagamentos;
create trigger pagamentos_updated_at before update on public.pagamentos for each row execute function public.definir_updated_at();

drop trigger if exists vales_updated_at on public.vales;
create trigger vales_updated_at before update on public.vales for each row execute function public.definir_updated_at();

-- ---------- segurança: cada usuário só vê e altera o que é seu ----------
alter table public.obras enable row level security;
alter table public.pessoas enable row level security;
alter table public.presencas enable row level security;
alter table public.dias_obra enable row level security;
alter table public.extras enable row level security;
alter table public.pagamentos enable row level security;
alter table public.vales enable row level security;
alter table public.fechamentos enable row level security;

-- leitura, inclusão e alteração do próprio dado
do $$
declare t text;
begin
  foreach t in array array['obras', 'pessoas', 'presencas', 'dias_obra', 'extras', 'pagamentos', 'vales'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler_proprio', t);
    execute format('drop policy if exists %I on public.%I', t || '_incluir_proprio', t);
    execute format('drop policy if exists %I on public.%I', t || '_alterar_proprio', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_ler_proprio', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_incluir_proprio', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_alterar_proprio', t);
  end loop;
end;
$$;

-- fechamentos: só ler e incluir
drop policy if exists fechamentos_ler_proprio on public.fechamentos;
create policy fechamentos_ler_proprio on public.fechamentos for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists fechamentos_incluir_proprio on public.fechamentos;
create policy fechamentos_incluir_proprio on public.fechamentos for insert to authenticated with check ((select auth.uid()) = user_id);

-- visitantes sem login não acessam nada
revoke all on public.obras, public.pessoas, public.presencas, public.dias_obra, public.extras,
  public.pagamentos, public.vales, public.fechamentos from anon;
revoke update, delete, truncate on public.fechamentos from authenticated;
revoke delete, truncate on public.obras, public.pessoas, public.presencas, public.dias_obra,
  public.extras, public.pagamentos, public.vales from authenticated;
revoke execute on function public.semana_fechada(uuid, date) from anon;
