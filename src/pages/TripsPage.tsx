import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { Banner } from "../components/ui.tsx";
import { toMessage } from "../lib/errors.ts";
import { formatDateJa } from "../lib/money.ts";
import { hotelSearchLinks } from "../lib/hotelLinks.ts";
import { createTrip, deleteTrip, getTrip, listJobs, listTrips, saveTrip, setReview } from "../lib/portalApi.ts";
import type { TripCheck, TripDetail } from "../lib/portalTypes.ts";

export function TripsPage() {
  const { id } = useParams();
  return id ? <TripEditor id={id} /> : <TripList />;
}

function TripList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTrips>>>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void listTrips()
      .then(setRows)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  return (
    <div className="stack">
      <div>
        <h1>出張・準備</h1>
        <p className="lead">日程、宿と移動のメモ、持ち物のチェックです。宿の手配は下書きだけで、この画面は予約しません。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void createTrip(title)
            .then((tripId) => navigate(`/trips/${tripId}`))
            .catch((caught: unknown) => setError(toMessage(caught)));
        }}
      >
        <label className="field">
          <span>出張名 *</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <button className="btn" type="submit">
          追加して開く
        </button>
      </form>
      {rows.map((row) => (
        <article key={row.id} className="card">
          <FictionNote text={row.title} />
          <h2>{row.title}</h2>
          <p className="meta">
            {formatDateJa(row.departOn)} 〜 {formatDateJa(row.returnOn)}
            <br />
            宿：{row.lodging || "未記入"}
            <br />
            案件：{row.jobTitle || "未設定"}
          </p>
          {row.awaitingConfirmation ? <span className="pill pill-sent">確認待ち</span> : null}
          <button className="btn" type="button" onClick={() => navigate(`/trips/${row.id}`)}>
            開く
          </button>
        </article>
      ))}
      {rows.length === 0 ? <Banner>出張はまだありません。</Banner> : null}
    </div>
  );
}

function TripEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [jobs, setJobs] = useState<{ id: string; title: string; address: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.all([getTrip(id), listJobs()])
      .then(([detail, jobRows]) => {
        setTrip(detail);
        setJobs(jobRows);
        if (!detail) setError("出張が見つかりません。");
      })
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, [id]);

  if (!trip) return error ? <Banner tone="error">{error}</Banner> : <p className="fine">読み込み中…</p>;

  function patch(partial: Partial<TripDetail>) {
    setTrip((current) => (current ? { ...current, ...partial } : current));
  }

  return (
    <div className="stack">
      <button className="btn quiet" type="button" onClick={() => navigate("/trips")}>
        出張一覧へ
      </button>
      <FictionNote text={trip.title} />
      <h1>出張・準備</h1>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <section className="card stack">
        <label className="field">
          <span>出張名 *</span>
          <input value={trip.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label className="field">
          <span>案件</span>
          <select
            value={trip.jobId ?? ""}
            onChange={(event) => {
              const jobId = event.target.value || null;
              const job = jobs.find((item) => item.id === jobId);
              patch({ jobId, siteAddress: trip.siteAddress || job?.address || "" });
            }}
          >
            <option value="">未選択</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>出発日</span>
            <input type="date" value={trip.departOn ?? ""} onChange={(event) => patch({ departOn: event.target.value || null })} />
          </label>
          <label className="field">
            <span>帰着日</span>
            <input type="date" value={trip.returnOn ?? ""} onChange={(event) => patch({ returnOn: event.target.value || null })} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>人数</span>
            <input inputMode="numeric" value={String(trip.partySize)} onChange={(event) => patch({ partySize: Number(event.target.value) || 1 })} />
          </label>
          <label className="field">
            <span>現場の住所</span>
            <input value={trip.siteAddress} onChange={(event) => patch({ siteAddress: event.target.value })} />
          </label>
          <label className="field">
            <span>チェックイン</span>
            <input type="date" value={trip.checkIn ?? ""} onChange={(event) => patch({ checkIn: event.target.value || null })} />
          </label>
          <label className="field">
            <span>チェックアウト</span>
            <input type="date" value={trip.checkOut ?? ""} onChange={(event) => patch({ checkOut: event.target.value || null })} />
          </label>
        </div>
        <HotelLinks address={trip.siteAddress} checkIn={trip.checkIn} checkOut={trip.checkOut} partySize={trip.partySize} />
        <h2>予約した宿の記録</h2>
        <p className="fine">予約サイトで取った内容をここに残します。この画面自体は予約しません。</p>
        <div className="grid-2">
          <label className="field">
            <span>ホテル名</span>
            <input value={trip.hotelName} onChange={(event) => patch({ hotelName: event.target.value })} />
          </label>
          <label className="field">
            <span>予約番号</span>
            <input value={trip.reservationNo} onChange={(event) => patch({ reservationNo: event.target.value })} />
          </label>
          <label className="field">
            <span>料金（円）</span>
            <input inputMode="numeric" value={trip.lodgingPrice} onChange={(event) => patch({ lodgingPrice: event.target.value })} />
          </label>
          <label className="field">
            <span>宿のメモ</span>
            <input value={trip.lodging} onChange={(event) => patch({ lodging: event.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>移動メモ</span>
          <textarea rows={3} value={trip.travelNotes} onChange={(event) => patch({ travelNotes: event.target.value })} />
        </label>
        <label className="field">
          <span>備考</span>
          <textarea rows={3} value={trip.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </label>
      </section>
      <section className="card stack">
        <h2>持ち物</h2>
        {trip.checks.map((item, index) => (
          <label key={item.key} className="check-row">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(event) =>
                patch({
                  checks: trip.checks.map((check, checkIndex) => (checkIndex === index ? { ...check, done: event.target.checked } : check)),
                })
              }
            />
            <input
              value={item.label}
              onChange={(event) =>
                patch({
                  checks: trip.checks.map((check, checkIndex) => (checkIndex === index ? { ...check, label: event.target.value } : check)),
                })
              }
            />
          </label>
        ))}
        <button
          className="btn quiet"
          type="button"
          onClick={() => patch({ checks: [...trip.checks, { key: crypto.randomUUID(), label: "", done: false } satisfies TripCheck] })}
        >
          項目を追加
        </button>
      </section>
      <p className="mail-warning">予約サイトが開くだけで、この画面は予約しません。確認待ちは担当者のメモです。</p>
      <div className="row-actions">
        <button
          className="btn"
          type="button"
          onClick={() =>
            void saveTrip(trip)
              .then(() => setNotice("保存しました。"))
              .catch((caught: unknown) => setError(toMessage(caught)))
          }
        >
          保存する
        </button>
        <button
          className="btn quiet"
          type="button"
          onClick={() =>
            void setReview("trips", trip.id, !trip.awaitingConfirmation)
              .then(() => {
                patch({ awaitingConfirmation: !trip.awaitingConfirmation });
                setNotice(trip.awaitingConfirmation ? "確認済みにしました。手配はしていません。" : "確認待ちにしました。手配はしていません。");
              })
              .catch((caught: unknown) => setError(toMessage(caught)))
          }
        >
          {trip.awaitingConfirmation ? "確認した（手配しない）" : "宿泊メモを確認待ちにする"}
        </button>
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            if (!window.confirm("この出張を削除しますか？")) return;
            void deleteTrip(trip.id)
              .then(() => navigate("/trips"))
              .catch((caught: unknown) => setError(toMessage(caught)));
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

function HotelLinks({
  address,
  checkIn,
  checkOut,
  partySize,
}: {
  address: string;
  checkIn: string | null;
  checkOut: string | null;
  partySize: number;
}) {
  const links = hotelSearchLinks({ address, checkIn, checkOut, partySize });
  return (
    <div className="row-actions">
      <a className="btn quiet" href={links.rakuten} target="_blank" rel="noopener noreferrer">
        楽天トラベルで探す
      </a>
      <a className="btn quiet" href={links.jalan} target="_blank" rel="noopener noreferrer">
        じゃらんで探す
      </a>
      <a className="btn quiet" href={links.google} target="_blank" rel="noopener noreferrer">
        Googleホテルで探す
      </a>
    </div>
  );
}
