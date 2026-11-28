import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FictionNote } from "../components/FictionNote.tsx";
import { Banner } from "../components/ui.tsx";
import { AppError, toMessage } from "../lib/errors.ts";
import { todayISO } from "../lib/money.ts";
import { deletePhoto, listJobs, listPhotos, uploadPhoto } from "../lib/portalApi.ts";
import { PHOTO_STAGES, STAGE_LABEL, type PhotoStage, type SitePhoto } from "../lib/portalTypes.ts";

export function PhotosPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<{ id: string; title: string; siteName: string }[]>([]);
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [stage, setStage] = useState<PhotoStage>("undercoat");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void listJobs()
      .then(setJobs)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    void listPhotos(jobId)
      .then(setPhotos)
      .catch((caught: unknown) => setError(toMessage(caught)));
  }, [jobId]);

  const visible = photos.filter((photo) => photo.stage === stage);
  const job = jobs.find((item) => item.id === jobId);

  async function onFile(file: File) {
    if (!jobId) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください。");
      return;
    }
    try {
      const blob = await shrinkImage(file);
      await uploadPhoto({ jobId, stage, caption, file: blob, takenOn: todayISO() });
      setCaption("");
      setPhotos(await listPhotos(jobId));
      setNotice("写真を保存しました。社外には送っていません。");
      setError("");
    } catch (caught) {
      setError(toMessage(caught));
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>現場写真</h1>
        <p className="lead">工程ごとに整理します。ファイルは社内だけの非公開置き場です。</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}
      <label className="field">
        <span>現場</span>
        <select value={jobId ?? ""} onChange={(event) => navigate(event.target.value ? `/photos/${event.target.value}` : "/photos")}>
          <option value="">選択</option>
          {jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {job ? <FictionNote text={job.title} /> : null}
      {jobId ? (
        <>
          <div className="segment wrap">
            {PHOTO_STAGES.map((item) => (
              <button key={item} type="button" className={stage === item ? "on" : ""} onClick={() => setStage(item)}>
                {STAGE_LABEL[item]}
              </button>
            ))}
          </div>
          <section className="card stack">
            <label className="field">
              <span>説明</span>
              <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="例: 架空）北面" />
            </label>
            <label className="btn">
              この工程に写真を追加
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void onFile(file);
                }}
              />
            </label>
            <p className="fine">大きい写真は保存前に縮小します。HEIC は JPEG にできない端末があります。</p>
          </section>
          <div className="photo-grid">
            {visible.map((photo) => (
              <figure key={photo.id}>
                {photo.url ? <img src={photo.url} alt={photo.caption || STAGE_LABEL[photo.stage]} /> : <div className="photo-missing">表示できません</div>}
                <figcaption>
                  <FictionNote text={photo.caption} />
                  {photo.caption || "説明なし"}
                </figcaption>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (!window.confirm("この写真を削除しますか？")) return;
                    void deletePhoto(photo)
                      .then(() => listPhotos(jobId))
                      .then(setPhotos)
                      .catch((caught: unknown) => setError(toMessage(caught)));
                  }}
                >
                  削除
                </button>
              </figure>
            ))}
          </div>
          {visible.length === 0 ? <Banner>{STAGE_LABEL[stage]}の写真はまだありません。</Banner> : null}
        </>
      ) : (
        <Banner>案件を選ぶと、工程ごとの写真が出ます。</Banner>
      )}
    </div>
  );
}

async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/heic" || file.type === "image/heif") {
    throw new AppError("この写真形式はここでは扱えません。JPEG で保存し直してください。");
  }
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  bitmap.close();
  return blob ?? file;
}
