import { useEffect, useMemo, useRef, useState } from 'react';
import { SANDBOX_GROUPS, SANDBOX_QUESTIONS, isSandboxStarter, sandboxStarter, sandboxText, type SandboxGroup, type SandboxQuestion } from '../content/sandbox';
import { diagnosePythonError, diagnoseSqlError, type Feedback } from '../engine/diagnose';
import { getExecutor } from '../engine/executors';
import { GROUP_ORDER, groupTables } from '../engine/schemaGroups';
import type { LoadState, Preview, SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { deleteScript, loadSandboxStore, saveScript, type SandboxStore } from '../sandbox/store';
import { CodeEditor } from './CodeEditor';
import { ResultTable } from './ResultTable';

/**
 * Песочница: свободный редактор без задания и без эталона.
 *
 * Единственный экран, где TaskView не участвует вовсе — здесь нет ни
 * сравнения с решением, ни SRS, ни прогресса. Переиспользуется механика,
 * а не компонент: тот же CodeEditor, тот же ResultTable с графиком, та же
 * SchemaSheet (открывается снаружи, см. onOpenSchema), тот же diagnose
 * для текста ошибок — но собраны заново, потому что здесь нет task.mode,
 * вокруг которого построен TaskView.
 *
 * Level редактора зафиксирован на 4 (максимум): в задании панель токенов
 * растёт вместе со сложностью, а здесь нет «задания», ограничивающего
 * подходящие приёмы, — свободный режим показывает все конструкции сразу.
 */
const EDITOR_LEVEL = 4;

/** Сколько последних запусков хранить в истории сессии — не связано с сохранёнными скриптами. */
const HISTORY_LIMIT = 20;

interface HistoryEntry {
  id: string;
  env: 'sql' | 'python';
  code: string;
  ranAt: string;
}

const nextId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  schema: SchemaDoc | null;
  onOpenSchema: (table?: string) => void;
}

export function Sandbox({ schema, onOpenSchema }: Props) {
  const { t, locale } = useI18n();
  const sqlExecutor = useMemo(() => getExecutor('sql')!, []);
  const pythonExecutor = useMemo(() => getExecutor('python')!, []);

  const [env, setEnv] = useState<'sql' | 'python'>('sql');
  /** Код держится отдельно на каждый язык — переключение вкладки не должно стирать набранное. */
  const [codeByEnv, setCodeByEnv] = useState<Record<'sql' | 'python', string>>(() => ({
    sql: sandboxStarter('sql', locale),
    python: sandboxStarter('python', locale),
  }));
  const code = codeByEnv[env];
  const setCode = (next: string) => setCodeByEnv((prev) => ({ ...prev, [env]: next }));

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [sqlLoad, setSqlLoad] = useState<LoadState>({ phase: 'idle' });
  const [pyLoad, setPyLoad] = useState<LoadState>({ phase: 'idle' });
  /** «Позже» на карточке согласия — только в памяти, тот же приём, что consentDeferred в App. */
  const [consentDeferred, setConsentDeferred] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [store, setStore] = useState<SandboxStore>(() => loadSandboxStore());
  const [savingOpen, setSavingOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  /**
   * Что стояло в редакторе до того, как его заменили открытым скриптом
   * или запуском из истории. Ревью по скриншоту нашло, что без этого
   * набранное исчезало молча: человек, писавший длинный запрос, открывал
   * сохранённый скрипт «посмотреть» и терял работу без всякого следа.
   * Это тот же класс дефекта, что закрывал пункт D долга (возврат на шаг
   * занятия терял введённый код), только здесь потерю провоцирует
   * безобидное на вид действие — клик по своему же скрипту.
   *
   * Спрашивать подтверждение до замены было бы хуже: диалог стоит на пути
   * у частого и безобидного действия ради редкого случая. Обратный ход
   * дешевле — заменяем сразу, но даём вернуть.
   */
  const [replaced, setReplaced] = useState<{ env: 'sql' | 'python'; code: string } | null>(null);

  /**
   * Редактор нужно показать, когда в него что-то положили не из него самого.
   *
   * На десктопе левая колонка липкая и редактор виден всегда — прокрутка
   * там только мешала бы. На телефоне колонка одна, и список вопросов лежит
   * на полторы тысячи пикселей ниже редактора: клик по вопросу вставлял
   * комментарий за пределами экрана, и это выглядело как «кнопка не
   * работает». Поэтому не «всегда прокручивать», а «прокрутить, если
   * не видно» — условие, а не привычка.
   */
  const editorRef = useRef<HTMLDivElement>(null);
  const revealEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const visible = r.bottom > 80 && r.top < window.innerHeight;
    if (!visible) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // SQL грузится сразу: в песочницу можно попасть, минуя трек sql (например,
  // из справочника или сразу после domain), и initDatabase идемпотентен —
  // если база уже загружена треком, второй вызов ничего не переделает.
  useEffect(() => {
    sqlExecutor.init().catch(() => undefined);
  }, [sqlExecutor]);
  useEffect(() => sqlExecutor.subscribeLoad(setSqlLoad), [sqlExecutor]);
  useEffect(() => pythonExecutor.subscribeLoad(setPyLoad), [pythonExecutor]);

  /**
   * Python — только по явному выбору вкладки, не сразу при открытии экрана.
   * Тот же принцип, что и в App с activeTrack === 'python': переключение
   * на язык — это и есть момент, когда согласие на 52 МБ уместно спросить,
   * а держать его на весу с самого входа в песочницу было бы навязчиво.
   */
  useEffect(() => {
    if (env === 'python') pythonExecutor.init().catch(() => undefined);
  }, [env, pythonExecutor]);

  // Результат предыдущего языка не может быть результатом на этом — это
  // разные движки над разным кодом, смешивать их на экране нечестно.
  useEffect(() => {
    setResult(null);
    setFeedback(null);
  }, [env]);

  const activeExecutor = env === 'sql' ? sqlExecutor : pythonExecutor;
  const activeLoad = env === 'sql' ? sqlLoad : pyLoad;

  const suggestions = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.map((tb) => tb.table);
    const columns = [...new Set(schema.tables.flatMap((tb) => tb.columns.map((c) => c.name)))];
    return [...tables, ...columns];
  }, [schema]);

  const diagnoseError = (message: string, traceback?: string): Feedback =>
    env === 'python'
      ? diagnosePythonError(message, suggestions, traceback ?? '', locale)
      : diagnoseSqlError(message, suggestions, locale);

  const notReady = activeLoad.phase === 'consent' || activeLoad.phase === 'loading';

  async function handleRun() {
    setRunning(true);
    setFeedback(null);
    try {
      const r = await activeExecutor.exec(code);
      setResult(r);
      setHistory((h) => [{ id: nextId(), env, code, ranAt: new Date().toISOString() }, ...h].slice(0, HISTORY_LIMIT));
    } catch (e) {
      setResult(null);
      const err = e as Error & { traceback?: string };
      setFeedback(diagnoseError(err.message, err.traceback));
    } finally {
      setRunning(false);
    }
  }

  function handleClear() {
    setCode('');
    setResult(null);
    setFeedback(null);
  }

  /** Вставляет вопрос комментарием — не заменяет то, что уже набрано, повторный клик не дублирует строку. */
  function insertQuestion(q: SandboxQuestion) {
    const text = sandboxText(q, locale).question;
    const line = `${env === 'sql' ? '--' : '#'} ${text}`;
    setCodeByEnv((prev) => {
      const cur = prev[env];
      if (cur.includes(line)) return prev;
      return { ...prev, [env]: `${line}\n${cur}` };
    });
    revealEditor();
  }

  /**
   * Положить в редактор чужой код (сохранённый скрипт, запуск из истории),
   * запомнив то, что там было. Один путь на оба случая: терять набранное
   * одинаково обидно, откуда бы замена ни пришла.
   */
  function putCode(targetEnv: 'sql' | 'python', code: string) {
    const current = codeByEnv[env];
    // Запоминаем только осмысленную потерю: пустое поле и нетронутая
    // заготовка — не работа человека, и предлагать «вернуть» для них
    // значило бы показывать кнопку, которая ничего не спасает.
    const worthKeeping = current.trim() !== '' && !isSandboxStarter(env, current) && current !== code;
    setReplaced(worthKeeping ? { env, code: current } : null);
    setEnv(targetEnv);
    setCodeByEnv((prev) => ({ ...prev, [targetEnv]: code }));
    revealEditor();
  }

  function undoReplace() {
    if (!replaced) return;
    setEnv(replaced.env);
    setCodeByEnv((prev) => ({ ...prev, [replaced.env]: replaced.code }));
    setReplaced(null);
    revealEditor();
  }

  function confirmSave() {
    const name = saveName.trim();
    if (!name) return;
    setStore((s) => saveScript(s, name, env, code));
    setSavingOpen(false);
  }

  /**
   * Таблицы, разложенные по месту в звезде.
   *
   * Тот же `groupTables`, что на экране «Данные», и тот же порядок групп —
   * не копия правила, а один источник: если песочница будет считать
   * справочником не то, что экран «Данные», человек получит два ответа
   * на один вопрос и не будет знать, какому верить.
   */
  const tablesByGroup = useMemo(() => {
    if (!schema) return null;
    const { group } = groupTables(schema);
    return GROUP_ORDER.map((kind) => ({
      kind,
      tables: schema.tables.filter((tb) => group.get(tb.table) === kind),
    })).filter((g) => g.tables.length > 0);
  }, [schema]);

  const questionsByGroup = useMemo(() => {
    const map = new Map<SandboxGroup, SandboxQuestion[]>();
    for (const q of SANDBOX_QUESTIONS) {
      const list = map.get(q.group) ?? [];
      list.push(q);
      map.set(q.group, list);
    }
    return map;
  }, []);

  /** Один тег и на даты сохранённых скриптов, и на разряды в числе строк. */
  const intlLocale = locale === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <>
      {/*
       * Без заголовка: экран уже назван в шапке, и «Песочница» вторым
       * разом подряд — тот же дефект, что задвоенный логотип в шапке
       * и повтор названия трека в trackIntro. Карточка здесь ради текста,
       * а не ради того, чтобы повторить слово.
       */}
      <div className="card">
        <p className="brief" style={{ margin: 0 }}>{t.sandbox.intro}</p>
      </div>

      <div className="feedback warn">
        <h3>{t.sandbox.disclaimerTitle}</h3>
        <p style={{ margin: 0 }}>{t.sandbox.disclaimerBody}</p>
      </div>

      <div className="sandbox-layout">
        <div className="sandbox-main">
          <div className="card" ref={editorRef}>
            <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
              <div className="tabs" role="tablist" aria-label={t.sandbox.envLabel} style={{ margin: 0, flex: 1 }}>
                <button type="button" role="tab" aria-pressed={env === 'sql'} onClick={() => setEnv('sql')}>
                  {t.sandbox.envSql}
                </button>
                <button type="button" role="tab" aria-pressed={env === 'python'} onClick={() => setEnv('python')}>
                  {t.sandbox.envPython}
                </button>
              </div>
              <button type="button" className="pill" style={{ flex: 'none' }} onClick={() => onOpenSchema()}>
                {t.task.schemaBtn}
              </button>
            </div>

            {/*
             * Согласие на Pyodide — та же карточка и те же строки, что на главной
             * трека python (t.consent.*): один и тот же вопрос не должен звучать
             * по-разному в зависимости от того, откуда в него пришли.
             */}
            {env === 'python' && pyLoad.phase === 'consent' && !consentDeferred && (
              <div className="feedback warn" style={{ marginBottom: 12 }}>
                <h3 style={{ marginTop: 0 }}>{t.consent.title}</h3>
                <p>{t.consent.body(Math.round(pyLoad.bytes / 1e6))}</p>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.note}</p>
                <div className="row">
                  <button type="button" className="btn" onClick={() => pythonExecutor.confirmDownload?.()}>
                    {t.consent.confirmBtn}
                  </button>
                  <button type="button" className="btn secondary" onClick={() => setConsentDeferred(true)}>
                    {t.consent.laterBtn}
                  </button>
                </div>
              </div>
            )}
            {env === 'python' && pyLoad.phase === 'consent' && consentDeferred && (
              <div className="feedback warn" style={{ marginBottom: 12 }}>
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>{t.consent.deferredNote}</p>
                <button type="button" className="btn secondary" onClick={() => setConsentDeferred(false)}>
                  {t.consent.resumeBtn(Math.round(pyLoad.bytes / 1e6))}
                </button>
              </div>
            )}

            <CodeEditor
              value={code}
              onChange={setCode}
              schema={schema}
              level={EDITOR_LEVEL}
              track={env}
              placeholder={t.task.placeholder(env)}
            />

            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn secondary" onClick={handleClear} disabled={running}>
                {t.sandbox.clearBtn}
              </button>
              <button type="button" className="btn" onClick={handleRun} disabled={running || notReady || !code.trim()}>
                {running ? t.sandbox.running : t.sandbox.runBtn}
              </button>
            </div>
            {activeLoad.phase === 'loading' && (
              <div className="load-progress" role="presentation">
                <div className="load-progress-bar" />
              </div>
            )}

            {/*
             * Сохранение живёт здесь, а не отдельной карточкой под результатом.
             * Там оно стояло после таблицы и читалось как «сохранить результат»,
             * хотя сохраняется код: действие над кодом обязано стоять рядом
             * с кодом, а не за блоком, который к нему не относится.
             */}
            {savingOpen ? (
              <div className="row" style={{ marginTop: 10 }}>
                <input
                  type="text"
                  className="reference-search"
                  style={{ marginBottom: 0 }}
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t.sandbox.saveNamePlaceholder}
                  autoFocus
                />
                <button type="button" className="btn sandbox-inline-btn" onClick={confirmSave} disabled={!saveName.trim()}>
                  {t.sandbox.saveConfirmBtn}
                </button>
                <button type="button" className="btn secondary sandbox-inline-btn" onClick={() => setSavingOpen(false)}>
                  {t.sandbox.saveCancelBtn}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="link-row"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setSaveName('');
                  setSavingOpen(true);
                }}
                disabled={!code.trim()}
              >
                {t.sandbox.saveBtn}
              </button>
            )}

            {/* Обратный ход после замены кода — см. replaced выше. */}
            {replaced && (
              <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>{t.sandbox.replacedNote}</span>
                <button type="button" className="pill sandbox-inline-btn" onClick={undoReplace}>
                  {t.sandbox.undoBtn}
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <div className={`feedback ${feedback.tone}`}>
              <h3>{feedback.title}</h3>
              {feedback.body && <p>{feedback.body}</p>}
              {feedback.nudges.length > 0 && (
                <ul>
                  {feedback.nudges.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="card">
              <ResultTable data={result} />
            </div>
          )}

          {!result && !feedback && (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>{t.sandbox.emptyResult}</p>
            </div>
          )}

        </div>

        <div className="sandbox-side">
          {/*
           * Список таблиц стоит выше вопросов намеренно.
           *
           * Вопросы обещают «с чего начать», но каждый из них подписан
           * «Где смотреть: fact_sellout, dim_product» — и человеку, который
           * видит эти имена впервые, подпись ничего не говорит. Сам он тем
           * более не начнёт: в песочнице пустой редактор и никакого способа
           * узнать, что вообще есть в базе, кроме кнопки схемы, которая
           * читается как справка по колонкам уже известной таблицы,
           * а не как карта датасета.
           *
           * Поэтому сначала «что здесь есть», потом «что спросить». Гранулярность
           * («одна строка = отгрузка позиции в день») важнее числа строк:
           * первое отвечает на вопрос, можно ли из таблицы получить нужное,
           * второе — только на вопрос, много ли данных.
           */}
          <div className="card">
            <h2>{t.sandbox.tablesTitle}</h2>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>{t.sandbox.tablesIntro}</p>
            {!tablesByGroup ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.schema.loading}</p>
            ) : (
              tablesByGroup.map(({ kind, tables }) => (
                <div key={kind} style={{ marginTop: 12 }}>
                  <p className="muted" style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t.data.groups[kind].title}
                  </p>
                  {tables.map((tb) => (
                    <button
                      key={tb.table}
                      type="button"
                      className="skill-row sandbox-table"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => onOpenSchema(tb.table)}
                      aria-label={t.sandbox.tableOpenAria(tb.table)}
                    >
                      <div className="name">
                        <code style={{ color: 'var(--code)' }}>{tb.table}</code> — {tb.title[locale]}
                        <small>{t.schema.grainLabel(tb.grain[locale])}</small>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>{t.sandbox.questionsTitle}</h2>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>{t.sandbox.questionsIntro}</p>
            {SANDBOX_GROUPS.map((group) => (
              <div key={group} style={{ marginTop: 12 }}>
                <p className="muted" style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t.sandbox.groups[group]}
                </p>
                {(questionsByGroup.get(group) ?? []).map((q) => {
                  const text = sandboxText(q, locale);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className="skill-row sandbox-question"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => insertQuestion(q)}
                      aria-label={t.sandbox.insertAria(text.title)}
                    >
                      <div className="name">
                        {text.title}
                        <small>{t.sandbox.questionTablesLabel} {q.tables.join(', ')}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>{t.sandbox.savedTitle}</h2>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>{t.sandbox.savedNote}</p>
            {store.scripts.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.sandbox.savedEmpty}</p>
            ) : (
              store.scripts.map((s) => (
                <div className="skill-row" key={s.id}>
                  <button
                    type="button"
                    className="name sandbox-row-btn"
                    onClick={() => putCode(s.env, s.code)}
                    aria-label={t.sandbox.savedOpenAria(s.name)}
                  >
                    {s.name}
                    <small>
                      {s.env === 'sql' ? t.sandbox.envSql : t.sandbox.envPython} · {new Date(s.savedAt).toLocaleDateString(intlLocale)}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="pill"
                    onClick={() => setStore((st) => deleteScript(st, s.id))}
                    aria-label={t.sandbox.savedDeleteAria(s.name)}
                  >
                    {t.sandbox.savedDeleteBtn}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>{t.sandbox.historyTitle}</h2>
            {history.length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.sandbox.historyEmpty}</p>
            ) : (
              history.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  className="skill-row"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => putCode(h.env, h.code)}
                  aria-label={t.sandbox.historyRestoreAria(history.length - i)}
                >
                  <div className="name">
                    #{history.length - i} · {h.env === 'sql' ? t.sandbox.envSql : t.sandbox.envPython}
                    <small>{h.code.trim().split('\n')[0]?.slice(0, 60)}</small>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
