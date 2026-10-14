import { useState } from "react";
import { api, download, sendFile } from "../api";
import { Err } from "../ui";

export default function Import() {
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async (kind: "preview" | "commit") => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const name = encodeURIComponent(file.name);
      if (kind === "preview") {
        setDone(null);
        setPrev(await sendFile(`/imports/workbook/preview?filename=${name}`, file));
      } else {
        setDone(
          await sendFile(
            `/imports/workbook/commit?filename=${name}&sha256=${prev.sha256}`,
            file
          )
        );
        setPrev(null);
      }
    } catch (e) {
      setErr(e);
    }
    setBusy(false);
  };

  const R = (r: any, id: string) => (
    <div className="card" style={{ padding: "18px" }}>
      <div className="metric-grid">
        {Object.entries(r.new).map(([k, v]) => (
          <div className="metric-card" key={k}>
            <span className="metric-card-num">{v as number}</span>
            <span className="metric-card-label">new {k}</span>
          </div>
        ))}
      </div>
      <p className="mu small" style={{ marginTop: 8 }}>
        Already in the system and skipped:{" "}
        {Object.entries(r.existing)
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")}
      </p>
      {r.errors.length > 0 && (
        <>
          <p className="err">{r.errors.length} rows need attention and will be left out:</p>
          {r.errors.slice(0, 20).map((e: any, i: number) => (
            <div className="tl" key={i}>
              <b>
                {e.sheet} row {e.row}
              </b>{" "}
              {e.message}
            </div>
          ))}
        </>
      )}
      {r.warnings.length > 0 && (
        <p className="mu small">
          {r.warnings.length} warnings, for example: {r.warnings[0]}
        </p>
      )}
      {(r.errors.length > 0 || r.warnings.length > 0) && (
        <button
          className="link"
          onClick={() => download(`/imports/${id}/errors`, "import-problems.csv")}
        >
          Download row-level problem report
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="cal-title-section">
        <h1>Import workbook</h1>
        <div className="cal-title-sub">
          Load your existing duty roster Excel workbook with validation and dry-run preview
        </div>
      </div>

      <div className="card" style={{ padding: "18px" }}>
        <p className="mu" style={{ fontSize: 13, marginBottom: 14 }}>
          Nothing is saved until you review the preview and confirm. Existing records are
          never overwritten.
        </p>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPrev(null);
            setDone(null);
          }}
          aria-label="Workbook file"
        />
        <Err e={err} />
        <button
          className="btn block"
          disabled={!file || busy}
          onClick={() => run("preview")}
        >
          {busy && !prev ? "Reading workbook..." : "Preview import"}
        </button>
      </div>

      {prev && (
        <>
          <h3>Preview</h3>
          {R(prev.report, prev.job_id)}
          <button
            className="btn block ok"
            disabled={busy}
            onClick={() => run("commit")}
          >
            Confirm and import
          </button>
        </>
      )}

      {done && (
        <>
          <h3>Imported</h3>
          {R(done.report, done.job_id)}
          <p className="ok-t" style={{ marginTop: 12 }}>
            Done. Open Team to give imported members an email and password.
          </p>
        </>
      )}
    </>
  );
}