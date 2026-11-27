import React from "react";
import {
  Flag,
  X,
  Users,
  BatteryCharging,
  HeartPulse,
  Trophy,
  AlertCircle,
  Play,
} from "lucide-react";
import type { InternationalBreakReport } from "../types/game";
import { formatDateShortPtBr } from "../utils/calendar";

interface InternationalBreakModalProps {
  report: InternationalBreakReport | null;
  clubName: string;
  ctaLabel?: string;
  onCta?: () => void;
  onClose: () => void;
}

export const InternationalBreakModal: React.FC<InternationalBreakModalProps> = ({
  report,
  clubName,
  ctaLabel,
  onCta,
  onClose,
}) => {
  if (!report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-indigo-500/40 bg-slate-900 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-indigo-950/40 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded bg-indigo-500/20 border border-indigo-400/40 px-2.5 py-0.5 text-[11px] font-black text-indigo-300">
                <Flag className="h-3.5 w-3.5" /> {report.label}
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {formatDateShortPtBr(report.startDate)} – {formatDateShortPtBr(report.endDate)}
              </span>
            </div>
            <h2 className="mt-1.5 text-xl font-black text-white">
              Resumo da Convocação — {clubName}
            </h2>
            <p className="text-xs text-slate-400">{report.competition}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Summary Strip */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Users className="h-3.5 w-3.5 text-indigo-400" /> Convocados do Clube
              </div>
              <div className="mt-1 text-2xl font-black text-white">
                {report.userCallups.length}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" /> Descansaram no CT
              </div>
              <div className="mt-1 text-lg font-black text-emerald-300">
                {report.restedCount} atletas (+28 energia)
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <HeartPulse className="h-3.5 w-3.5 text-rose-400" /> Baixas Médicas
              </div>
              <div className="mt-1 text-2xl font-black text-rose-300">
                {report.userCallups.filter((c) => c.injuryMatches).length}
              </div>
            </div>
          </div>

          {/* Callups Table */}
          <div>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">
              Atletas Convocados ({report.userCallups.length})
            </h3>
            {report.userCallups.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
                Nenhum atleta do {clubName} foi convocado nesta Data FIFA. Todo o elenco permaneceu treinando no clube.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Seleção</th>
                      <th className="px-3 py-2">Atleta</th>
                      <th className="px-3 py-2 text-center">Papel</th>
                      <th className="px-3 py-2 text-center">Jogos / Min</th>
                      <th className="px-3 py-2 text-center">G / A</th>
                      <th className="px-3 py-2 text-right">Impacto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {report.userCallups.map((c) => (
                      <tr key={c.playerId} className="hover:bg-slate-900/50">
                        <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-200">
                          <span className="mr-1.5">{c.flag}</span>
                          {c.nationLabel}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-white">{c.playerName}</div>
                          <div className="text-[10px] text-slate-400">
                            {c.position} • OVR {c.overall}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              c.role === "starter"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-400/40"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {c.role === "starter" ? "Titular" : "Reserva"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-300">
                          {c.apps}j • {c.minutes}&apos;
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-emerald-300">
                          {c.goals}G {c.assists}A
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-bold text-amber-300">
                            −{c.staminaLoss} energia
                          </div>
                          {c.injuryMatches && (
                            <div className="text-[10px] font-bold text-rose-400">
                              Lesão ({c.injuryMatches} rod.)
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Results */}
          {report.results.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                <Trophy className="h-3.5 w-3.5 text-amber-400" /> Resultados das Seleções Envolvidas
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {report.results.map((r, idx) => (
                  <div
                    key={`${r.nationKey}-${r.matchIndex}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-bold text-white">
                      {r.flag} {r.nationLabel}{" "}
                      <span className="text-[10px] text-slate-500">
                        ({r.isHome ? "C" : "F"})
                      </span>
                    </span>
                    <span className="mx-2 shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-black text-white">
                      {r.goalsFor} – {r.goalsAgainst}
                    </span>
                    <span className="truncate text-right text-slate-300">
                      {r.opponentLabel} {r.opponentFlag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snubs */}
          {report.userSnubs.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
                <AlertCircle className="h-3.5 w-3.5 text-slate-400" /> Ficaram de Fora ({report.userSnubs.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {report.userSnubs.map((s) => (
                  <div
                    key={s.playerId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-200">
                        {s.flag} {s.playerName}{" "}
                        <span className="text-[10px] text-slate-400">
                          ({s.position} • {s.overall})
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-slate-400">{s.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/70 px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
          >
            Fechar
          </button>
          {ctaLabel && onCta && (
            <button
              onClick={onCta}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-300"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
