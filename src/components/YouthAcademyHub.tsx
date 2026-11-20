import React, { useMemo, useState } from "react";
import {
  GraduationCap,
  ArrowUpRight,
  ArrowDownLeft,
  Repeat,
} from "lucide-react";
import type { Club, Player } from "../types/game";
import { formatMoney, getOverallColor, getRoleBadgeClass } from "../utils/format";
import { PlayerAvatar } from "./PlayerAvatar";

interface YouthAcademyHubProps {
  userClub: Club;
  allClubs: Club[];
  players: Player[];
  onPromoteYouth: (playerId: number) => void;
  onDemoteToYouth: (playerId: number) => void;
  onLoanOutYouth: (playerId: number, destinationClubId: number) => void;
  onExerciseBuyOption: (playerId: number) => void;
  onSelectPlayer: (player: Player) => void;
}

export const YouthAcademyHub: React.FC<YouthAcademyHubProps> = ({
  userClub,
  allClubs,
  players,
  onPromoteYouth,
  onDemoteToYouth,
  onLoanOutYouth,
  onExerciseBuyOption,
  onSelectPlayer,
}) => {
  const [activeTab, setActiveTab] = useState<"academy" | "loans" | "first_team_youngsters">("academy");
  const [selectedDestinationClubId, setSelectedDestinationClubId] = useState<number>(allClubs[0]?.id ?? 1);
  const [loaningPlayerId, setLoaningPlayerId] = useState<number | null>(null);

  // User's youth academy players
  const academyPlayers = useMemo(
    () =>
      players
        .filter((p) => p.clubId === userClub.id && p.squadCategory === "youth")
        .sort((a, b) => b.potential - a.potential || b.overall - a.overall),
    [players, userClub.id]
  );

  // First-team players aged <= 21 who could be demoted to youth
  const demotableYoungsters = useMemo(
    () =>
      players
        .filter((p) => p.clubId === userClub.id && p.squadCategory !== "youth" && p.age <= 22)
        .sort((a, b) => a.overall - b.overall),
    [players, userClub.id]
  );

  // Players loaned TO the user's club
  const loansIn = useMemo(
    () => players.filter((p) => p.clubId === userClub.id && p.loan?.isLoan),
    [players, userClub.id]
  );

  // Players loaned OUT by user's club to other teams
  const loansOut = useMemo(
    () =>
      players.filter(
        (p) => p.loan?.isLoan && p.loan?.parentClubId === userClub.id && p.clubId !== userClub.id
      ),
    [players, userClub.id]
  );

  // Eligible destination clubs for loans
  const loanDestinationClubs = useMemo(
    () =>
      allClubs
        .filter((c) => c.id !== userClub.id)
        .sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1) || b.avgOverall - a.avgOverall),
    [allClubs, userClub.id]
  );

  const bestPotentialPlayer = academyPlayers[0];

  const getDevelopmentBadge = (p: Player) => {
    const growth = p.potential - p.overall;
    if (p.potential >= 85) {
      return {
        label: "Joia de Nível Mundial",
        bg: "border-amber-400/40 bg-amber-500/15 text-amber-300",
      };
    }
    if (p.potential >= 80) {
      return {
        label: "Promessa de Alto Nível",
        bg: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      };
    }
    if (growth >= 8) {
      return {
        label: "Alto Crescimento (+" + growth + ")",
        bg: "border-sky-500/40 bg-sky-500/15 text-sky-300",
      };
    }
    return {
      label: "Composição de Elenco",
      bg: "border-slate-700 bg-slate-800 text-slate-300",
    };
  };

  return (
    <div className="space-y-6">
      {/* Academy Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/40 p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <GraduationCap className="h-4 w-4" /> Categorias de Base & Academia
            </div>
            <h1 className="mt-1 font-h1 text-2xl font-black text-white sm:text-3xl">
              Divisão de Base • {userClub.name} Sub-20
            </h1>
            <p className="mt-1 text-xs text-slate-300">
              Desenvolva as futuras joias do clube, promova garotos ao time profissional e gerencie o empréstimo de talentos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">Atletas na Base</div>
              <div className="text-xl font-black text-emerald-400">{academyPlayers.length}</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-center">
              <div className="text-[10px] font-bold uppercase text-slate-400">Empréstimos Ativos</div>
              <div className="text-xl font-black text-sky-400">{loansIn.length + loansOut.length}</div>
            </div>

            {bestPotentialPlayer && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-right">
                <div className="text-[10px] font-bold uppercase text-amber-300">Maior Joia da Base</div>
                <div className="text-sm font-black text-white">
                  {bestPotentialPlayer.name} ({bestPotentialPlayer.potential}★)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          <button
            onClick={() => setActiveTab("academy")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "academy"
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                : "bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <GraduationCap className="h-4 w-4" /> Plantel da Base ({academyPlayers.length})
          </button>

          <button
            onClick={() => setActiveTab("loans")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "loans"
                ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                : "bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Repeat className="h-4 w-4" /> Empréstimos ({loansIn.length + loansOut.length})
          </button>

          <button
            onClick={() => setActiveTab("first_team_youngsters")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "first_team_youngsters"
                ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20"
                : "bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" /> Jovens no Principal ({demotableYoungsters.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Academy Players */}
      {activeTab === "academy" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Meninos da Base Sub-20 ({academyPlayers.length} atletas)
            </h2>
            <span className="text-xs text-slate-400">
              Garotos promovidos ficam imediatamente disponíveis para a prancheta tática.
            </span>
          </div>

          {academyPlayers.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center text-slate-400">
              Nenhum jogador na base no momento. Na virada da temporada, novas promessas serão recrutadas na peneira da academia!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {academyPlayers.map((p) => {
                const growth = p.potential - p.overall;
                const badge = getDevelopmentBadge(p);

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-slate-700"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => onSelectPlayer(p)}
                          className="flex items-center gap-3 text-left group"
                        >
                          <PlayerAvatar
                            name={p.name}
                            imageUrl={p.imageUrl}
                            size="md"
                            accentColor={userClub.primaryColor}
                          />
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-emerald-300">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span
                                className={`rounded border px-1.5 py-0.2 text-[10px] font-bold ${getRoleBadgeClass(
                                  p.roleCategory
                                )}`}
                              >
                                {p.primaryPosition}
                              </span>
                              <span>• {p.age} anos</span>
                              <span>• {p.nationality}</span>
                            </div>
                          </div>
                        </button>

                        <div className="text-right">
                          <span
                            className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                              p.overall
                            )}`}
                          >
                            {p.overall}
                          </span>
                        </div>
                      </div>

                      {/* Potential and Growth bar */}
                      <div className="mt-3 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-400">Potencial Máximo:</span>
                          <span className="font-black text-amber-300">
                            {p.potential} ★ (+{growth} pts)
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-amber-400"
                            style={{
                              width: `${Math.min(100, (p.overall / p.potential) * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <span className={`rounded border px-1.5 py-0.5 font-bold ${badge.bg}`}>
                            {badge.label}
                          </span>
                          <span className="text-slate-400">Val: {formatMoney(p.marketValueEur)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3">
                      <button
                        onClick={() => onPromoteYouth(p.id)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" /> Subir ao Principal
                      </button>

                      <button
                        onClick={() => setLoaningPlayerId(p.id)}
                        title="Emprestar para outro clube ganhar rodagem"
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-sky-500/50 hover:bg-slate-700 hover:text-white"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Loan modal/inline selector */}
                    {loaningPlayerId === p.id && (
                      <div className="mt-3 rounded-xl border border-sky-500/40 bg-sky-950/40 p-3">
                        <div className="text-[11px] font-bold text-sky-300">
                          Selecione o clube de destino para empréstimo:
                        </div>
                        <select
                          value={selectedDestinationClubId}
                          onChange={(e) => setSelectedDestinationClubId(Number(e.target.value))}
                          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none"
                        >
                          {loanDestinationClubs.slice(0, 40).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.league ?? c.division}) • OVR {c.avgOverall}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setLoaningPlayerId(null)}
                            className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-white"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => {
                              onLoanOutYouth(p.id, selectedDestinationClubId);
                              setLoaningPlayerId(null);
                            }}
                            className="rounded-lg bg-sky-500 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-sky-400"
                          >
                            Confirmar Empréstimo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Loans */}
      {activeTab === "loans" && (
        <div className="space-y-6">
          {/* Loans In */}
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sky-400">
              <ArrowDownLeft className="h-4 w-4" /> Emprestados ao {userClub.name} ({loansIn.length})
            </h2>
            {loansIn.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-xs text-slate-400">
                Nenhum jogador atuando por empréstimo no momento.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {loansIn.map((p) => {
                  const canBuy =
                    p.loan?.buyOptionFeeEur &&
                    userClub.transferBudgetEur >= p.loan.buyOptionFeeEur;

                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-sky-500/30 bg-slate-900/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => onSelectPlayer(p)}
                          className="flex items-center gap-3 text-left group"
                        >
                          <PlayerAvatar name={p.name} imageUrl={p.imageUrl} size="md" />
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-sky-300">
                              {p.name}
                            </div>
                            <div className="text-xs text-slate-400">
                              Pertence ao:{" "}
                              <strong className="text-white">{p.loan?.parentClubName}</strong>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              Contrato de empréstimo até o fim da temporada {p.loan?.loanEndSeason}
                            </div>
                          </div>
                        </button>

                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                            p.overall
                          )}`}
                        >
                          {p.overall}
                        </span>
                      </div>

                      {p.loan?.buyOptionFeeEur && (
                        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">
                              Opção de Compra Fixada
                            </div>
                            <div className="text-sm font-black text-amber-300">
                              {formatMoney(p.loan.buyOptionFeeEur)}
                            </div>
                          </div>

                          <button
                            disabled={!canBuy}
                            onClick={() => onExerciseBuyOption(p.id)}
                            className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            {canBuy ? "Exercer Compra" : "Sem Orçamento"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Loans Out */}
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-400">
              <ArrowUpRight className="h-4 w-4" /> Nossos Jogadores Emprestados para Ganhar Rodagem ({loansOut.length})
            </h2>
            {loansOut.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-xs text-slate-400">
                Nenhum jovem do clube emprestado no momento. Use o botão na aba da Base para emprestar garotos.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {loansOut.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <PlayerAvatar name={p.name} imageUrl={p.imageUrl} size="sm" />
                      <div>
                        <div className="text-sm font-bold text-white">{p.name}</div>
                        <div className="text-xs text-slate-400">
                          Jogando no: <strong className="text-emerald-300">{p.clubName}</strong> ({p.league})
                        </div>
                        <div className="text-[11px] text-amber-300">
                          {p.age} anos • OVR {p.overall} (Potencial {p.potential}★)
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs">
                      <span className="rounded bg-black/40 px-2 py-1 text-[10px] font-bold text-slate-300 border border-slate-800">
                        Retorna em 2027
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Demotable Youngsters from First Team */}
      {activeTab === "first_team_youngsters" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Atletas Jovens no Elenco Principal (≤ 22 anos)
            </h2>
            <span className="text-xs text-slate-400">
              Mova garotos para o Sub-20 para abrir espaço na folha e no banco do time principal.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {demotableYoungsters.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => onSelectPlayer(p)}
                    className="flex items-center gap-3 text-left group"
                  >
                    <PlayerAvatar name={p.name} imageUrl={p.imageUrl} size="md" />
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-emerald-300">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {p.primaryPosition} • {p.age} anos
                      </div>
                    </div>
                  </button>

                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-black ${getOverallColor(
                      p.overall
                    )}`}
                  >
                    {p.overall}
                  </span>
                </div>

                <div className="mt-4 border-t border-slate-800 pt-3">
                  <button
                    onClick={() => onDemoteToYouth(p.id)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/10 py-2 text-xs font-bold text-amber-300 hover:bg-amber-400/20"
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5" /> Mover para a Base Sub-20
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
