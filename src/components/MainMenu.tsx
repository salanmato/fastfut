import React, { useRef, useState } from "react";
import {
  Play,
  PlusCircle,
  Upload,
  Download,
  Settings,
  Trophy,
  Database,
  Trash2,
  X,
  Compass,
  Shirt,
  Users,
  Building2,
  ShoppingBag,
  HeartPulse,
  Calendar as CalendarIcon,
} from "lucide-react";
import type { RawDatabase, SaveState, StandingRow } from "../types/game";
import { formatMoney } from "../utils/format";
import { getClubVisuals, getKitThemePalette } from "../utils/clubVisuals";
import { ClubBadge } from "./ClubBadge";
import { ClubKit } from "./ClubKit";

interface MainMenuProps {
  rawDb: RawDatabase | null;
  save: SaveState | null;
  standings: StandingRow[];
  onContinue: () => void;
  onNewGame: () => void;
  onImportSave: (file: File) => void;
  onExportSave: () => void;
  onDeleteSave: () => void;
  onToggleKitTheme: () => void;
  onToggleAutoFormation: () => void;
  onToggleAllowTransfersOutsideWindow: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  rawDb,
  save,
  standings,
  onContinue,
  onNewGame,
  onImportSave,
  onExportSave,
  onDeleteSave,
  onToggleKitTheme,
  onToggleAutoFormation,
  onToggleAllowTransfersOutsideWindow,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const savedClub = save ? save.clubs.find((c) => c.id === save.userClubId) : undefined;
  const kitTheme: "home" | "away" = save?.kitTheme ?? "home";
  const palette = savedClub ? getKitThemePalette(savedClub, kitTheme) : null;
  const savedStanding = savedClub
    ? standings.find((s) => s.club.id === savedClub.id)
    : undefined;

  const stadiumBgUrl = savedClub
    ? getClubVisuals(savedClub).stadiumImageUrl
    : rawDb?.clubs[0]
    ? getClubVisuals(rawDb.clubs[0]).stadiumImageUrl
    : "";

  const showcaseClubs = rawDb?.clubs.slice(0, 8) ?? [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportSave(file);
    }
    e.target.value = "";
  };

  return (
    <div
      className={`${
        palette ? "club-theme-root" : "bg-[#090d16]"
      } relative min-h-screen overflow-hidden text-slate-100 flex flex-col justify-between`}
      style={
        palette
          ? { ...palette.pageBackgroundStyle, ...palette.cssVars }
          : { backgroundColor: "#090d16" }
      }
    >
      {/* Background Stadium Photo */}
      {stadiumBgUrl && (
        <img
          src={stadiumBgUrl}
          alt="Stadium background"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-10"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[#090d16]/85" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Container */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Title + Menu Actions */}
          <div className="space-y-6 lg:col-span-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-300">
                <Trophy className="h-3.5 w-3.5" /> Premier League 2026/27 • Dados Reais
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Football Manager{" "}
                <span
                  className="text-emerald-400"
                  style={palette ? { color: palette.accentPrimary } : undefined}
                >
                  26/27
                </span>
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Assuma o comando técnico e financeiro de um clube da Premier League, ajuste formações ao vivo no radar 2D e gerencie estádio, lesões e transferências.
              </p>
            </div>

            <div className="space-y-3">
              {/* Continue Career */}
              {save && savedClub && (
                <button
                  onClick={onContinue}
                  style={
                    palette
                      ? { backgroundColor: palette.accentPrimary, color: palette.accentText }
                      : undefined
                  }
                  className="group flex w-full items-center justify-between gap-4 rounded-xl bg-emerald-500 p-4 text-left text-slate-950 transition hover:brightness-110"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ClubBadge club={savedClub} size="lg" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-black uppercase tracking-wider opacity-80">
                        Continuar Carreira
                      </div>
                      <div className="truncate text-lg font-black">{savedClub.name}</div>
                      <div className="truncate text-xs font-semibold opacity-85">
                        {save.managerName} •{" "}
                        {save.seasonFinished
                          ? "Temporada Finalizada"
                          : `Rodada ${save.currentMatchweek}/38`}{" "}
                        {savedStanding ? `• ${savedStanding.position}º (${savedStanding.points} pts)` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/15">
                    <Play className="h-5 w-5 fill-current" />
                  </div>
                </button>
              )}

              {/* New Game */}
              <button
                onClick={onNewGame}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/85 p-4 text-left transition hover:border-white/25 hover:bg-slate-900"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                    <PlusCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-black text-white">Novo Jogo</div>
                    <div className="text-xs text-slate-400">
                      {save
                        ? "Escolher um novo clube da Premier League 26/27"
                        : "Escolha um dos 20 clubes e inicie sua carreira"}
                    </div>
                  </div>
                </div>
              </button>

              {/* Load / Export / Settings Row */}
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-xs font-bold text-slate-200 transition hover:border-white/25 hover:text-white"
                >
                  <Upload className="h-4 w-4 text-sky-400" /> Carregar Save
                </button>

                <button
                  disabled={!save}
                  onClick={onExportSave}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-xs font-bold text-slate-200 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4 text-emerald-400" /> Exportar JSON
                </button>

                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-xs font-bold text-slate-200 transition hover:border-white/25 hover:text-white"
                >
                  <Settings className="h-4 w-4 text-amber-400" /> Opções & Dados
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Career Card or Features Showcase */}
          <div className="lg:col-span-6">
            {save && savedClub ? (
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <div className="relative h-44 w-full overflow-hidden bg-slate-950">
                  {getClubVisuals(savedClub).stadiumImageUrl && (
                    <img
                      src={getClubVisuals(savedClub).stadiumImageUrl}
                      alt={savedClub.stadium}
                      className="h-full w-full object-cover opacity-55"
                    />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 border-t border-slate-800 bg-slate-950/90 px-5 py-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                        Save em Andamento
                      </div>
                      <h2 className="text-xl font-black text-white">{savedClub.stadium}</h2>
                      <p className="text-xs text-slate-300">
                        Caixa: {formatMoney(savedClub.transferBudgetEur)} •{" "}
                        {savedClub.capacity.toLocaleString("pt-BR")} lugares
                      </p>
                    </div>
                    <ClubKit club={savedClub} variant={kitTheme} size="md" />
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Últimas Notícias da Carreira
                  </div>
                  {save.news.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                          Rod. {item.matchweek}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Destaques desta Edição
                  </span>
                  {rawDb && (
                    <span className="text-[11px] font-semibold text-slate-400">
                      {rawDb.clubs.length} clubes • {rawDb.players.length} jogadores
                    </span>
                  )}
                </div>

                {showcaseClubs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 py-1">
                    {showcaseClubs.map((c) => (
                      <ClubBadge key={c.id} club={c} size="md" />
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      icon: Users,
                      title: "Prancheta & Campinho 2D",
                      desc: "Formações, substituições ao vivo e radar tático minuto a minuto.",
                    },
                    {
                      icon: Building2,
                      title: "Gestão de Estádio",
                      desc: "Ingressos, preparo de gramado, obras e renda de bilheteria.",
                    },
                    {
                      icon: ShoppingBag,
                      title: "Mercado Global",
                      desc: "Mais de 1.000 atletas reais com atributos EA FC 27 e Transfermarkt.",
                    },
                    {
                      icon: HeartPulse,
                      title: "DM & Expulsões",
                      desc: "Lesões dinâmicas e pausa tática automática em expulsões.",
                    },
                  ].map((feat) => {
                    const Icon = feat.icon;
                    return (
                      <div
                        key={feat.title}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5"
                      >
                        <Icon className="h-4 w-4 text-emerald-400" />
                        <div className="mt-2 text-xs font-bold text-white">{feat.title}</div>
                        <div className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                          {feat.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 bg-slate-950 py-3 text-center text-[11px] text-slate-400">
        Football Manager 26/27 — Premier League • Dados: EA FC 27, Premier League 26/27, Transfermarkt & FIFA WC 2026
      </footer>

      {/* Options & Database Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="flex items-center gap-2 text-base font-black text-white">
                <Settings className="h-4 w-4 text-amber-400" /> Opções & Base de Dados
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {rawDb && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Database className="h-3.5 w-3.5" /> Base de Dados Carregada ({rawDb.season})
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="font-black text-white">{rawDb.clubs.length}</div>
                    <div className="text-[10px] text-slate-400">Clubes</div>
                  </div>
                  <div>
                    <div className="font-black text-white">{rawDb.players.length}</div>
                    <div className="text-[10px] text-slate-400">Jogadores</div>
                  </div>
                  <div>
                    <div className="font-black text-white">{rawDb.fixtures.length}</div>
                    <div className="text-[10px] text-slate-400">Jogos</div>
                  </div>
                  <div>
                    <div className="font-black text-white">{rawDb.referees.length}</div>
                    <div className="text-[10px] text-slate-400">Árbitros</div>
                  </div>
                </div>
              </div>
            )}

            {save ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <Compass className="h-4 w-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        Auto-Formação em Expulsões/Lesões
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Pausa a partida e abre o painel tático ao sofrer vermelho ou lesão
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onToggleAutoFormation}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                      save.autoOpenFormationOnRedCard ?? true
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {save.autoOpenFormationOnRedCard ?? true ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <Shirt className="h-4 w-4 text-sky-400" />
                    <div>
                      <div className="text-xs font-bold text-white">Tema do Uniforme</div>
                      <div className="text-[11px] text-slate-400">
                        Alterna as cores do jogo entre Uniforme 1 e Uniforme 2
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onToggleKitTheme}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    {kitTheme === "home" ? "Uniforme 1" : "Uniforme 2"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-2.5">
                    <CalendarIcon className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        Permitir transferências fora da janela
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Ignora abertura e fechamento oficial do mercado (Modo Livre)
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onToggleAllowTransfersOutsideWindow}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black ${
                      save.allowTransfersOutsideWindow ?? false
                        ? "bg-amber-400 text-slate-950"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {save.allowTransfersOutsideWindow ?? false ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <div className="flex items-center gap-2.5">
                    <Trash2 className="h-4 w-4 text-rose-400" />
                    <div>
                      <div className="text-xs font-bold text-white">Apagar Save Local</div>
                      <div className="text-[11px] text-rose-200/80">
                        Remove a carreira armazenada no navegador
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onDeleteSave();
                      setShowSettings(false);
                    }}
                    className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-400"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400">
                Inicie ou carregue uma carreira para configurar as opções do save.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
