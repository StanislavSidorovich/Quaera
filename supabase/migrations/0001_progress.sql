-- Хранилище прогресса: одна строка на человека.
--
-- Почему целым JSON, а не таблицами навыков и заданий по строкам.
-- Слияние (src/sync/merge.ts) — операция над прогрессом целиком: оно
-- сравнивает эпохи, выбирает состояние навыка неделимой пятёркой полей
-- и пересчитывает totalSolved из всех записей разом. Разложив это по
-- строкам, пришлось бы либо тянуть их все на клиент перед каждым слиянием
-- (то же самое, только дороже), либо переписать слияние на SQL — то есть
-- завести вторую реализацию правил, которые гейт проверяет для первой.
-- Две реализации разойдутся, и разойдутся молча: ровно тот класс порчи,
-- ради защиты от которого фаза 1 делалась до всякой сети.
--
-- Размер под это подходит: прогресс — сотни навыков и заданий, единицы
-- килобайт JSON. Postgres хранит jsonb до гигабайта в поле.

create table if not exists public.progress (
  -- Идентификатор человека, а не отдельный ключ строки: одна строка
  -- на пользователя, поэтому первичный ключ и внешний ключ — одно поле.
  -- on delete cascade нужен для удаления аккаунта: строка обязана уйти
  -- вместе с записью в auth.users, иначе обещание «удалили всё»
  -- держалось бы на том, что кто-то не забудет удалить вторую половину.
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Тот же объект, что лежит в localStorage под quaera.progress.v1
  -- и что отдаёт exportProgress. Совпадение намеренное: файл экспорта,
  -- строка в базе и локальное хранилище — один формат, и любой из трёх
  -- можно скормить mergeProgress без преобразования.
  data jsonb not null,

  -- Служебное, для наблюдения и отладки. Синхронизация на это время
  -- НЕ опирается: порядок решают resetAt и lastReviewedAt внутри data,
  -- а часы сервера и двух устройств расходятся, и полагаться на них
  -- значило бы вернуть ту самую зависимость от порядка, от которой
  -- уходит слияние.
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Четыре политики вместо одной "for all": select и insert должны
-- проверять разные вещи (что читаешь своё против того, что пишешь под
-- своим именем), и разведённые правила читаются однозначно. Delete
-- нужен для удаления аккаунта из самого приложения.
create policy "progress: читать своё"
  on public.progress for select
  using (auth.uid() = user_id);

create policy "progress: создавать своё"
  on public.progress for insert
  with check (auth.uid() = user_id);

create policy "progress: обновлять своё"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "progress: удалять своё"
  on public.progress for delete
  using (auth.uid() = user_id);

-- updated_at проставляет база, а не клиент: клиентские часы бывают
-- сбиты, а это поле нужно именно для «когда сервер последний раз видел
-- запись», иначе оно не отвечает ни на один вопрос честно.
create or replace function public.touch_progress_updated_at()
returns trigger
language plpgsql
-- search_path пустой: функция вызывается с правами определившего,
-- и без явного пути её поведение зависело бы от search_path вызывающего.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_touch_updated_at on public.progress;
create trigger progress_touch_updated_at
  before update on public.progress
  for each row execute function public.touch_progress_updated_at();
