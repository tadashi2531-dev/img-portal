import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { useVoiceApply } from "../components/VoiceContext.tsx";
import { Banner } from "../components/ui.tsx";
import { listCustomers } from "../lib/api.ts";
import { toMessage } from "../lib/errors.ts";
import { formatYen } from "../lib/money.ts";
import { deleteJob, estimatesForJob, getJob, linkEstimate, listEstimateChoices, saveJob } from "../lib/portalApi.ts";
import { fetchDailyWeather, geocodePlace, type DayWeather } from "../lib/weather.ts";
import { COST_CATEGORIES, JOB_PHASES, PHASE_LABEL, type JobCost, type JobDay, type JobDetail, type JobPhase } from "../lib/portalTypes.ts";
import type { Customer } from "../lib/types.ts";

export function JobDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [linked, setLinked] = useState<{ id: string; estimateNo: string; title: string; total: number }[]>([]);
  const [choices, setChoices] = useState<{ id: string; label: string }[]>([]);
  const [estimateId, setEstimateId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [weather, setWeather] = useState<DayWeather[]>([]);
  const [weatherNote, setWeatherNote] = useState("");

  async function load() {
    const [detail, customerRows, estimateRows, allEstimates] = await Promise.all([
      getJob(id),
      listCustomers(),
      estimatesForJob(id),
      listEstimateChoices(),
    ]);
    setJob(detail);
    setCustomers(customerRows);
    setLinked(estimateRows);
    setChoices(allEstimates);
    if (!detail) setError("案件が見つかりません。");
  }

  useEffect(() => {
    void load().catch((caught: unknown) => setError(toMessage(caught)));
  }, [id]);

  useEffect(() => {
    if (!job) return;
    let cancel = false;
    void (async () => {
      try {
        let latitude = job.latitude;
        let longitude = job.longitude;
        if ((latitude == null || longitude == null) && job.address.trim()) {
          const place = await geocodePlace(job.address);
          if (!place || cancel) {
            if (!cancel && !place) setWeatherNote("住所から場所を特定できません。緯度・経度を入力してください。予報は16日先までです。");
            return;
          }
          latitude = place.latitude;
          longitude = place.longitude;
          setJob((current) => (current ? { ...current, latitude, longitude } : current));
        }
        if (latitude == null || longitude == null || cancel) return;
        const days = await fetchDailyWeather(latitude, longitude);
        if (!cancel) {
          setWeather(days);
          setWeatherNote("Open-Meteo の予報です。雨や強風の日は塗装・防水の作業に注意してください。16日先までです。");
        }
      } catch (caught) {
        if (!cancel) setWeatherNote(toMessage(caught));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [job?.id, job?.address, job?.latitude, job?.longitude]);

  useVoiceApply(({ intent, transcript }) => {
    if (!job) return;
    if (intent.kind === "job_day") {
      patch({
        days: [...job.days, { key: crypto.randomUUID(), workDate: intent.date, workContent: intent.content, paint: "", assignee: "", hours: "0" }],
      });
      setNotice("聞き取りを工程の行に入れました。保存ボタンを押すまで記録されません。");
      return;
    }
    patch({ notes: transcript });
    setNotice("聞き取りをメモに入れました。保存はしていません。");
  });

  if (!job) return error ? <Banner tone="error">{error}</Banner> : <p className="fine">読み込み中…</p>;

  function patch(partial: Partial<JobDetail>) {
    setJob((current) => (current ? { ...current, ...partial } : current));
  }

  async function save() {
    if (!job) return;
    setSaving(true);
    setError("");
    try {
      await saveJob(job);
      setNotice("保存しました。");
      await load();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <button className="btn quiet" type="button" onClick={() => navigate("/jobs")}>
        案件一覧へ
      </button>
      <FictionNote text={job.title} />
      <h1>現場・案件</h1>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack">
        <label className="field">
          <span>案件名 *</span>
          <input value={job.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>現場名</span>
            <input value={job.siteName} onChange={(event) => patch({ siteName: event.target.value })} />
          </label>
          <label className="field">
            <span>住所</span>
            <input value={job.address} onChange={(event) => patch({ address: event.target.value })} />
          </label>
          <label className="field">
            <span>開始日</span>
            <input type="date" value={job.startDate ?? ""} onChange={(event) => patch({ startDate: event.target.value || null })} />
          </label>
          <label className="field">
            <span>終了日</span>
            <input type="date" value={job.endDate ?? ""} onChange={(event) => patch({ endDate: event.target.value || null })} />
          </label>
        </div>
        <label className="field">
          <span>得意先</span>
          <select value={job.customerId ?? ""} onChange={(event) => patch({ customerId: event.target.value || null })}>
            <option value="">未選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segment">
          {JOB_PHASES.map((phase) => (
            <button key={phase} type="button" className={job.phase === phase ? "on" : ""} onClick={() => patch({ phase: phase as JobPhase })}>
              {PHASE_LABEL[phase]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>進捗 {job.progress}%</span>
          <input type="range" min={0} max={100} value={job.progress} onChange={(event) => patch({ progress: Number(event.target.value) })} />
        </label>
        <div className="track">
          <div style={{ width: `${job.progress}%` }} />
        </div>
        <div className="grid-2">
          <label className="field">
            <span>緯度</span>
            <input
              inputMode="decimal"
              value={job.latitude ?? ""}
              onChange={(event) => patch({ latitude: event.target.value === "" ? null : Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>経度</span>
            <input
              inputMode="decimal"
              value={job.longitude ?? ""}
              onChange={(event) => patch({ longitude: event.target.value === "" ? null : Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="fine">{weatherNote || "住所か緯度経度があると、工程の日に天気を出します。音声報告はまだありません。"}</p>
        <label className="field">
          <span>メモ</span>
          <textarea rows={3} value={job.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </label>
      </section>
      <section className="card stack">
        <h2>日別工程</h2>
        {job.days.map((day, index) => (
          <div key={day.key} className="line-card stack">
            <div className="grid-2">
              <label className="field">
                <span>日付</span>
                <input type="date" value={day.workDate} onChange={(event) => patchDay(index, { workDate: event.target.value })} />
              </label>
              <label className="field">
                <span>時間</span>
                <input inputMode="decimal" value={day.hours} onChange={(event) => patchDay(index, { hours: event.target.value })} />
              </label>
              <label className="field">
                <span>作業内容</span>
                <input value={day.workContent} onChange={(event) => patchDay(index, { workContent: event.target.value })} />
              </label>
              <label className="field">
                <span>塗料</span>
                <input value={day.paint} onChange={(event) => patchDay(index, { paint: event.target.value })} />
              </label>
              <label className="field">
                <span>担当</span>
                <input value={day.assignee} onChange={(event) => patchDay(index, { assignee: event.target.value })} />
              </label>
            </div>
            {day.workDate ? <WeatherLine weather={weather.find((item) => item.date === day.workDate)} /> : null}
            <button className="btn danger" type="button" onClick={() => patch({ days: job.days.filter((item) => item.key !== day.key) })}>
              この日を削除
            </button>
          </div>
        ))}
        <button
          className="btn quiet"
          type="button"
          onClick={() => patch({ days: [...job.days, { key: crypto.randomUUID(), workDate: "", workContent: "", paint: "", assignee: "", hours: "0" }] })}
        >
          工程の行を追加
        </button>
      </section>
      <section className="card stack">
        <h2>原価</h2>
        {job.costs.map((cost, index) => (
          <div key={cost.key} className="grid-2">
            <label className="field">
              <span>区分</span>
              <select value={cost.category} onChange={(event) => patchCost(index, { category: event.target.value as JobCost["category"] })}>
                {COST_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>内容</span>
              <input value={cost.label} onChange={(event) => patchCost(index, { label: event.target.value })} />
            </label>
            <label className="field">
              <span>金額</span>
              <input inputMode="numeric" value={cost.amount} onChange={(event) => patchCost(index, { amount: event.target.value })} />
            </label>
            <label className="field">
              <span>日付</span>
              <input type="date" value={cost.costDate} onChange={(event) => patchCost(index, { costDate: event.target.value })} />
            </label>
          </div>
        ))}
        <button
          className="btn quiet"
          type="button"
          onClick={() =>
            patch({
              costs: [...job.costs, { key: crypto.randomUUID(), category: "材料", label: "", amount: "0", costDate: "" }],
            })
          }
        >
          原価を追加
        </button>
      </section>
      <section className="card stack">
        <h2>この案件の見積</h2>
        {linked.length === 0 ? <p className="fine">まだ紐づいていません。</p> : null}
        {linked.map((row) => (
          <button key={row.id} className="btn quiet" type="button" onClick={() => navigate(`/estimates/${row.id}`)}>
            {row.estimateNo} {row.title} {formatYen(row.total)}
          </button>
        ))}
        <label className="field">
          <span>見積を紐づける</span>
          <select value={estimateId} onChange={(event) => setEstimateId(event.target.value)}>
            <option value="">選択</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn quiet"
          type="button"
          disabled={!estimateId}
          onClick={() =>
            void linkEstimate(estimateId, job.id)
              .then(load)
              .catch((caught: unknown) => setError(toMessage(caught)))
          }
        >
          紐づける
        </button>
        <button className="btn quiet" type="button" onClick={() => navigate(`/photos/${job.id}`)}>
          現場写真を開く
        </button>
      </section>
      <div className="row-actions">
        <button className="btn" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "保存中…" : "保存する"}
        </button>
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            if (!window.confirm("この案件を削除しますか？工程・原価・写真も消えます。")) return;
            void deleteJob(job.id)
              .then(() => navigate("/jobs"))
              .catch((caught: unknown) => setError(toMessage(caught)));
          }}
        >
          案件を削除
        </button>
      </div>
    </div>
  );

  function patchDay(index: number, partial: Partial<JobDay>) {
    if (!job) return;
    patch({ days: job.days.map((day, dayIndex) => (dayIndex === index ? { ...day, ...partial } : day)) });
  }

  function patchCost(index: number, partial: Partial<JobCost>) {
    if (!job) return;
    patch({ costs: job.costs.map((cost, costIndex) => (costIndex === index ? { ...cost, ...partial } : cost)) });
  }
}

function WeatherLine({ weather }: { weather: DayWeather | undefined }) {
  if (!weather) return <p className="fine">この日の予報はまだありません（16日先まで）。</p>;
  const alerts = [weather.rainWarning ? "雨の注意" : "", weather.windWarning ? "強風の注意" : ""].filter(Boolean);
  return (
    <p className={alerts.length > 0 ? "weather-alert" : "fine"}>
      {weather.label} {weather.tempMin ?? "—"}〜{weather.tempMax ?? "—"}℃ ／ 降水 {weather.precipProbability ?? "—"}% ／ 風 {weather.windSpeed ?? "—"}m/s
      {alerts.length > 0 ? ` ／ ${alerts.join("・")}` : ""}
    </p>
  );
}
