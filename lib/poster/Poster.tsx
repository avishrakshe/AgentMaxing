/**
 * POSTER (rendered by next/og / Satori, 1080x1350)
 * Dark editorial: near-black, faint grid, one glass card, neon accent gradient, tight display type.
 * Satori rule: any element with more than one child needs display:flex.
 */
import type { PosterSpec } from "../types";

export const W = 1080;
export const H = 1350;

type Theme = { accentFrom?: string; accentTo?: string };

const INK = "#F4F3EE";
const MUTED = "rgba(244,243,238,0.62)";
const FAINT = "rgba(244,243,238,0.14)";

function gradient(theme?: Theme) {
  return theme?.accentFrom && theme?.accentTo
    ? `linear-gradient(90deg, ${theme.accentFrom}, ${theme.accentTo})`
    : "linear-gradient(90deg, #22D3EE, #8B5CF6 55%, #EC4899)";
}

/** Step the display size down as the title gets longer, so it never overflows. */
function titleSize(title: string, template: PosterSpec["template"]) {
  const n = title.length;
  const scale = template === "digest" ? 0.8 : 1;
  const px = n <= 14 ? 132 : n <= 22 ? 116 : n <= 32 ? 96 : n <= 46 ? 80 : 64;
  return Math.round(px * scale);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function daysUntil(iso?: string) {
  if (!iso) return null;
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const d = Math.round((new Date(iso).getTime() - today.getTime()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

function Chip({ children, accent, theme }: { children: string; accent?: boolean; theme?: Theme }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "12px 22px",
        borderRadius: 999,
        fontFamily: "Mono",
        fontSize: 24,
        letterSpacing: 1,
        textTransform: "uppercase",
        // Satori chokes on `undefined` style values, so spread only what applies.
        ...(accent ? { color: "#07070A", backgroundImage: gradient(theme) } : { color: INK, border: `1.5px solid ${FAINT}` }),
      }}
    >
      {children}
    </div>
  );
}

function Facts({ facts, theme }: { facts: string[]; theme?: Theme }) {
  if (!facts.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {facts.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 14, height: 14, borderRadius: 4, backgroundImage: gradient(theme), flexShrink: 0 }} />
          <div style={{ display: "flex", fontSize: 34, color: INK, fontWeight: 500, lineHeight: 1.2 }}>{f}</div>
        </div>
      ))}
    </div>
  );
}

function Body({ spec, theme }: { spec: PosterSpec; theme?: Theme }) {
  if (spec.template === "event") {
    const [day, time] = (spec.dateIST ?? "Date TBA").split("·").map((s) => s.trim());
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "26px 36px", borderRadius: 28, border: `1.5px solid ${FAINT}`, backgroundColor: "rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 24, color: MUTED, letterSpacing: 2, textTransform: "uppercase" }}>When</div>
          <div style={{ display: "flex", fontSize: day.length > 20 ? 54 : 72, fontWeight: 700, letterSpacing: -2, color: INK, marginTop: 8 }}>{clip(day, 30)}</div>
          {time ? <div style={{ display: "flex", fontSize: 40, fontWeight: 500, marginTop: 6, color: MUTED }}>{clip(time, 30)}</div> : null}
        </div>
        <Facts facts={spec.facts} theme={theme} />
      </div>
    );
  }

  if (spec.template === "hackathon") {
    const days = daysUntil(spec.deadlineISO);
    const chip = days === null ? spec.dateIST : days < 0 ? "Deadline passed" : days === 0 ? "Deadline today" : `Deadline in ${days} day${days === 1 ? "" : "s"}`;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        {spec.prize ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Mono", fontSize: 24, color: MUTED, letterSpacing: 2, textTransform: "uppercase" }}>Prize pool</div>
            <div
              style={{
                display: "flex",
                fontSize: spec.prize.length > 20 ? 64 : 84,
                fontWeight: 700,
                letterSpacing: -3,
                backgroundImage: gradient(theme),
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {spec.prize}
            </div>
          </div>
        ) : null}
        {chip ? (
          <div style={{ display: "flex" }}>
            <Chip accent theme={theme}>{clip(chip, 34)}</Chip>
          </div>
        ) : null}
        <Facts facts={spec.facts} theme={theme} />
      </div>
    );
  }

  if (spec.template === "digest") {
    const items = spec.items?.length ? spec.items : spec.facts;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div style={{ display: "flex", fontFamily: "Mono", fontSize: 30, color: "#07070A", backgroundImage: gradient(theme), borderRadius: 10, width: 54, height: 54, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {String(i + 1)}
            </div>
            <div style={{ display: "flex", fontSize: items.length > 4 ? 32 : 36, fontWeight: 500, color: INK, lineHeight: 1.2, paddingTop: 6, maxWidth: 780 }}>{item}</div>
          </div>
        ))}
      </div>
    );
  }

  return <Facts facts={spec.facts} theme={theme} />;
}

export function Poster({ spec, theme, background }: { spec: PosterSpec; theme?: Theme; background?: string | null }) {
  const label = { announcement: "Announcement", event: "Event", hackathon: "Hackathon", digest: "Daily digest" }[spec.template];
  const meta = [spec.dateIST && spec.template !== "event" ? spec.dateIST.split("·")[0].trim() : null, spec.ecosystem, spec.sourceHandle].filter(Boolean).join("  ·  ");

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", backgroundColor: "#07070A", color: INK, fontFamily: "Display" }}>
      {/* background: AI image or neon glow + faint grid */}
      {background ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={background} width={W} height={H} style={{ position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", opacity: 0.9 }} alt="" />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle at 12% 8%, rgba(34,211,238,0.30), transparent 42%), radial-gradient(circle at 92% 30%, rgba(139,92,246,0.32), transparent 45%), radial-gradient(circle at 60% 100%, rgba(236,72,153,0.26), transparent 48%)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          display: "flex",
          backgroundImage: "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "90px 90px, 90px 90px",
        }}
      />

      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: 72 }}>
        {/* top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "Mono", fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>
            <div style={{ display: "flex", width: 18, height: 18, borderRadius: 999, backgroundImage: gradient(theme) }} />
            <div style={{ display: "flex" }}>{clip(spec.ecosystem ?? "Crier", 28)}</div>
          </div>
          <Chip>{label}</Chip>
        </div>

        {/* glass card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 56,
            flexGrow: 1,
            flexShrink: 1,
            minHeight: 0,
            padding: "60px 56px",
            borderRadius: 44,
            border: "1.5px solid rgba(255,255,255,0.16)",
            backgroundImage: "linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 60%)",
            boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", width: 120, height: 8, borderRadius: 8, backgroundImage: gradient(theme), marginBottom: 40 }} />
          <div style={{ display: "flex", flexShrink: 0, fontSize: titleSize(spec.title, spec.template), fontWeight: 700, lineHeight: 0.96, letterSpacing: "-0.045em", color: INK, maxWidth: 860 }}>
            {spec.title}
          </div>
          {spec.subtitle ? (
            <div style={{ display: "flex", flexShrink: 0, fontSize: spec.subtitle.length > 80 ? 30 : 38, fontWeight: 500, lineHeight: 1.3, color: MUTED, marginTop: 30, maxWidth: 860 }}>
              {spec.subtitle}
            </div>
          ) : null}
          <div style={{ display: "flex", flexGrow: 1, minHeight: 32 }} />
          <div style={{ display: "flex", flexShrink: 0 }}>
            <Body spec={spec} theme={theme} />
          </div>
        </div>

        {/* bottom row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 48, gap: 24, flexShrink: 0 }}>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 22, letterSpacing: 1, color: MUTED, flexShrink: 1, whiteSpace: "nowrap", overflow: "hidden" }}>
            {clip(meta, (spec.cta?.length ?? 0) > 14 ? 34 : 46)}
          </div>
          {spec.cta ? (
            <div style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: "18px 34px", borderRadius: 999, backgroundImage: gradient(theme), color: "#07070A", fontSize: 30, fontWeight: 700 }}>
              {`${spec.cta} →`}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
