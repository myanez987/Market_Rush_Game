import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ACTIONS,
  CATALOG,
  decisionLesson,
  getAction,
  getVenture,
  rankBusinesses,
  VENTURES,
  type ActionId,
  type CapitalInvestment,
  type Decision,
  type FinancingAction,
  type InventoryPolicy,
  type MatchPace,
  type PriceTier,
  type Profile,
  type PublicPlayer,
  type RoomSnapshot
} from "@market-rush/shared";
import { gameRequest, loadCatalog, restoreOrCreateProfile, unlockItem, updateNickname } from "./api";
import { TycoonWorld } from "./TycoonWorld";
import { FinancialCenter } from "./FinancialCenter";

const CREDENTIAL_KEY = "market-rush-guest-credential";
const ROOM_KEY = "market-rush-current-room";
const formatMoney = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(Math.round(value)).toLocaleString()}`;

function Button({ children, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`button button--${variant} ${className}`} {...props}>{children}</button>;
}

function Field({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className="field"><span>{label}</span><input {...props} />{hint && <small>{hint}</small>}</label>;
}

function Logo() {
  return <div className="logo" aria-label="Market Rush"><span className="logo__mark">M</span><span>MARKET<br /><strong>RUSH</strong></span></div>;
}

function Shell({ children, profile }: { children: ReactNode; profile?: Profile }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        {profile && <div className="token-pill" title="Tokens unlock variety, never competitive power"><span>◆</span> {profile.tokens} tokens</div>}
      </header>
      <main>{children}</main>
      <footer>Fast business weeks. Smart tradeoffs. One valuable company.</footer>
    </div>
  );
}

function Timer({ endsAt, phase }: { endsAt?: number; phase: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () => setSeconds(endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return <div className={`timer ${seconds <= 5 && seconds > 0 ? "timer--urgent" : ""}`} aria-live="polite"><span>{phase}</span><strong>{seconds}s</strong></div>;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" }) {
  return <div className={`metric ${tone ? `metric--${tone}` : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  return <div className="toast" role="status"><span>{message}</span><button onClick={onDismiss} aria-label="Dismiss">×</button></div>;
}

function Onboarding({ onCreate, busy }: { onCreate: (nickname: string) => void; busy: boolean }) {
  const [nickname, setNickname] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (nickname.trim().length >= 2) onCreate(nickname.trim()); };
  return (
    <Shell>
      <section className="hero hero--onboarding">
          <div className="eyebrow">THE FAST BUSINESS CHALLENGE</div>
        <h1>Can your idea survive <em>the real world?</em></h1>
        <p>Launch a venture, lead your team, react to the market, and build the most valuable company.</p>
        <form className="onboarding-card" onSubmit={submit}>
          <div className="step-chip">01 · Create your founder</div>
          <Field label="What should the room call you?" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Your nickname" minLength={2} maxLength={16} autoFocus />
          <Button type="submit" disabled={busy || nickname.trim().length < 2}>{busy ? "Opening the doors…" : "Enter Market Rush →"}</Button>
          <small>No sign-up. Progress stays on this browser.</small>
        </form>
      </section>
    </Shell>
  );
}

function Home({ profile, credential, connected, onProfile, onCreateRoom, onSolo, onJoinRoom, notify }: {
  profile: Profile; credential: string; connected: boolean; onProfile: (profile: Profile) => void;
  onCreateRoom: () => void; onSolo: () => void; onJoinRoom: (code: string) => void; notify: (message: string) => void;
}) {
  const queryCode = new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  const [code, setCode] = useState(queryCode);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(profile.nickname);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [unlocking, setUnlocking] = useState<string>();

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await updateNickname(credential, nickname);
      onProfile(result.profile);
      setEditing(false);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not update your nickname."); }
  };

  const unlock = async (itemId: string) => {
    setUnlocking(itemId);
    try {
      const result = await unlockItem(credential, itemId);
      onProfile(result.profile);
      notify("Unlocked! It is now part of your collection.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not unlock that item."); }
    finally { setUnlocking(undefined); }
  };

  return (
    <Shell profile={profile}>
      <section className="home-grid">
        <div className="home-intro">
          <div className="eyebrow">WELCOME BACK, {profile.nickname.toUpperCase()}</div>
          <h1>Build fast.<br /><em>Learn faster.</em></h1>
          <p>Every match compresses three or six business weeks of pricing, people, cash, and surprises into a few minutes. Your choices move the numbers—no dice-roll victory.</p>
          <div className="how-row">
            <div><b>01</b><span>Pick a venture</span></div><div><b>02</b><span>Make the calls</span></div><div><b>03</b><span>Build company value</span></div>
          </div>
        </div>
        <aside className="play-card">
          <div className="online-line"><span className={connected ? "online-dot" : "offline-dot"} /> {connected ? "LIVE SERVER READY" : "CONNECTING…"}</div>
          <h2>Start a session</h2>
          <Button onClick={onCreateRoom} disabled={!connected}>Create a room <span>＋</span></Button>
          <Button variant="secondary" className="solo-button" onClick={onSolo} disabled={!connected}>Play solo vs 3 bots <span>♟</span></Button>
          <div className="or"><span />OR JOIN FRIENDS<span /></div>
          <form onSubmit={(event) => { event.preventDefault(); onJoinRoom(code); }}>
            <Field label="4-character room code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 4))} placeholder="RUSH" maxLength={4} inputMode="text" />
            <Button variant="secondary" type="submit" disabled={!connected || code.length !== 4}>Join room →</Button>
          </form>
        </aside>
      </section>
      <section className="home-actions">
        <button className="text-action" onClick={() => setCatalogOpen(!catalogOpen)}><span>◆</span> {catalogOpen ? "Close unlock shop" : "Spend tokens & view unlocks"}</button>
        <button className="text-action" onClick={() => setEditing(!editing)}>✎ Edit founder name</button>
      </section>
      {editing && <form className="inline-editor" onSubmit={saveName}><Field label="Founder name" value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={16} /><Button type="submit">Save</Button></form>}
      {catalogOpen && <section className="catalog-section">
        <div className="section-heading"><div><div className="eyebrow">YOUR NEXT MOVE</div><h2>Unlock more ways to play</h2></div><p>Unlocks add variety—not stronger stats.</p></div>
        <div className="catalog-grid">{CATALOG.map((item) => {
          const owned = profile.unlockedItemIds.includes(item.id);
          return <article className="catalog-card" key={item.id}><span className="catalog-card__emoji">{item.emoji}</span><div className="tag">{item.type}</div><h3>{item.name}</h3><p>{item.description}</p><Button variant={owned ? "ghost" : "secondary"} disabled={owned || unlocking === item.id || profile.tokens < item.cost} onClick={() => unlock(item.id)}>{owned ? "Owned ✓" : `${item.cost} tokens`}</Button></article>;
        })}</div>
      </section>}
    </Shell>
  );
}

function PlayerRow({ player, onRemove }: { player: PublicPlayer; onRemove?: (id: string) => void }) {
  const venture = player.ventureId ? getVenture(player.ventureId) : undefined;
  return <div className={`player-row ${!player.connected ? "player-row--offline" : ""}`}>
    <div className={`avatar ${player.isBot ? "avatar--bot" : ""}`}>{player.isBot ? "◆" : player.nickname.slice(0, 1).toUpperCase()}</div>
    <div><strong>{player.nickname}</strong><span>{player.spectator ? "Spectating" : venture ? `${venture.emoji} ${venture.name}` : "Choosing a venture…"}</span></div>
    {player.isBot && <span className="bot-chip">BOT</span>}
    {player.isHost && <span className="host-chip">HOST</span>}
    {!player.spectator && <span className={player.ready ? "ready-dot ready-dot--yes" : "ready-dot"}>{player.ready ? "READY" : "NOT READY"}</span>}
    {player.isBot && onRemove && <button className="remove-bot" onClick={() => onRemove(player.id)} aria-label={`Remove ${player.nickname}`}>×</button>}
  </div>;
}

function Lobby({ room, profile, onSelect, onReady, onStart, onAddBot, onRemoveBot, onPace, onRounds, notify }: {
  room: RoomSnapshot; profile: Profile; onSelect: (id: string) => void; onReady: (ready: boolean) => void; onStart: () => void; onAddBot: () => void; onRemoveBot: (id: string) => void; onPace: (pace: MatchPace) => void; onRounds: (rounds: number) => void; notify: (message: string) => void;
}) {
  const me = room.players.find((player) => player.id === profile.id)!;
  const active = room.players.filter((player) => !player.spectator);
  const allReady = active.length >= 2 && active.every((player) => player.ready && player.ventureId);
  const copyInvite = async () => {
    const url = `${window.location.origin}?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); notify("Invite link copied."); }
    catch { notify(`Share room code ${room.code}`); }
  };
  return <Shell profile={profile}>
    <section className="lobby-heading">
      <div><div className="eyebrow">ROOM OPEN · {active.length}/8 PLAYERS</div><h1>Choose your <em>venture.</em></h1><p>Different business models. Equal earning potential. Your decisions make the difference.</p></div>
      <button className="room-code" onClick={copyInvite} aria-label={`Copy invite for room ${room.code}`}><span>ROOM CODE</span><strong>{room.code}</strong><small>Tap to copy invite</small></button>
    </section>
    <TycoonWorld players={room.players} day={0} phase="lobby" />
    <div className="lobby-layout">
      <section>
        {me.spectator ? <div className="notice-card"><b>This match is already full or underway.</b><p>You’re watching now and will get a seat in the next lobby.</p></div> : <>
          <div className="venture-grid">{VENTURES.map((venture) => {
            const locked = venture.unlockCost > 0 && !profile.unlockedItemIds.includes(venture.id);
            const selected = me.ventureId === venture.id;
            return <button key={venture.id} disabled={locked || me.ready} className={`venture-card ${selected ? "venture-card--selected" : ""}`} onClick={() => onSelect(venture.id)}>
              <span className="venture-card__emoji">{venture.emoji}</span><span className="tag">{venture.sector}</span><h3>{venture.name}</h3><p>{venture.tagline}</p><small>{locked ? `🔒 ${venture.unlockCost} tokens` : venture.strengths}</small>{selected && <b className="selected-ribbon">SELECTED ✓</b>}
            </button>;
          })}</div>
          <div className="ready-bar"><div><strong>{me.ready ? "You’re ready to trade." : me.ventureId ? "Venture selected." : "Pick a venture to continue."}</strong><span>You can change it until you mark yourself ready.</span></div><Button onClick={() => onReady(!me.ready)} disabled={!me.ventureId} variant={me.ready ? "secondary" : "primary"}>{me.ready ? "Not ready" : "I’m ready →"}</Button></div>
        </>}
      </section>
      <aside className="players-panel"><div className="panel-title"><h2>Founders</h2><span>{active.length}/8</span></div>{room.players.map((player) => <PlayerRow key={player.id} player={player} onRemove={me.isHost ? onRemoveBot : undefined} />)}
        {me.isHost && active.length < 8 && <Button variant="ghost" className="add-bot-button" onClick={onAddBot}>＋ Add a bot founder</Button>}
        <div className="pace-picker"><label htmlFor="match-pace">MATCH SPEED</label><select id="match-pace" value={room.matchPace} disabled={!me.isHost} onChange={(event) => onPace(event.target.value as MatchPace)}><option value="quick">Quick</option><option value="standard">Standard</option><option value="relaxed">Relaxed</option></select><label htmlFor="match-rounds">MATCH LENGTH</label><select id="match-rounds" value={room.maxDays} disabled={!me.isHost} onChange={event => onRounds(Number(event.target.value))}><option value={3}>3 weeks · short match</option><option value={6}>6 weeks · classic</option></select><small>Each round represents one full business week.</small></div>
        {me.isHost && !me.spectator && <Button onClick={onStart} disabled={!allReady} className="start-button">{active.length < 2 ? "Waiting for one more…" : allReady ? `Start the ${room.maxDays}-week rush →` : "Waiting for everyone…"}</Button>}
        {!me.isHost && !me.spectator && <p className="waiting-note">The host starts when everyone is ready.</p>}
      </aside>
    </div>
  </Shell>;
}

function Standings({ room, profileId }: { room: RoomSnapshot; profileId: string }) {
  const active = room.players.filter((player): player is PublicPlayer & { business: NonNullable<PublicPlayer["business"]> } => !player.spectator && Boolean(player.business));
  const liveRanks = rankBusinesses(active.map((player) => ({ playerId: player.id, business: player.business })));
  const ranked = liveRanks.map((rank) => ({ rank, player: active.find((player) => player.id === rank.playerId)! }));
  return <aside className="standings"><div className="panel-title"><h2>Live valuation</h2><span>WEEK {room.day}/{room.maxDays}</span></div>{ranked.map(({ player, rank }) => <div className={`standing-row ${player.id === profileId ? "standing-row--me" : ""}`} key={player.id}><b>{rank.rank}</b><span>{getVenture(player.ventureId ?? "")?.emoji}</span><div><strong>{player.nickname}</strong><small>{player.business.insolvent ? "Insolvent" : `${formatMoney(player.business.cash)} cash · ${formatMoney(player.business.debt)} debt`}</small></div><em>{formatMoney(rank.companyValuation)}</em></div>)}</aside>;
}

function Game({ room, profile, onSubmit }: { room: RoomSnapshot; profile: Profile; onSubmit: (decision: Decision) => void }) {
  const me = room.players.find((player) => player.id === profile.id)!;
  const business = me.business;
  const [priceTier, setPriceTier] = useState<PriceTier>(business?.lastPriceTier ?? "standard");
  const [actionId, setActionId] = useState<ActionId>("hold");
  const [financingAction, setFinancingAction] = useState<FinancingAction>("none");
  const [inventoryPolicy, setInventoryPolicy] = useState<InventoryPolicy>("balanced");
  const [capitalInvestment, setCapitalInvestment] = useState<CapitalInvestment>("none");
  const [incidentOptionId, setIncidentOptionId] = useState<string>();
  const firstOpponent = room.players.find((player) => !player.spectator && player.id !== profile.id);
  const [intelPlayerId, setIntelPlayerId] = useState(firstOpponent?.id ?? profile.id);
  useEffect(() => {
    if (room.phase === "forecast") {
      setPriceTier(business?.lastPriceTier ?? "standard"); setActionId("hold"); setFinancingAction("none"); setInventoryPolicy("balanced"); setCapitalInvestment("none");
      setIncidentOptionId(me.incident?.options.find((option) => option.balanced)?.id ?? me.incident?.options[0]?.id);
    }
  }, [room.day, room.phase]);

  if (me.spectator) return <Shell profile={profile}><section className="game-heading"><div><div className="eyebrow">SPECTATOR MODE</div><h1>Watch the market <em>move.</em></h1></div><Timer endsAt={room.phaseEndsAt} phase={room.phase} /></section><TycoonWorld players={room.players} day={room.day} phase={room.phase} phaseEndsAt={room.phaseEndsAt} directive={room.worldDirective} publicSignals={room.publicMarketSignals} marketEventId={room.marketEvent?.id} /><div className="game-layout"><MarketCard room={room} /><Standings room={room} profileId={profile.id} /></div></Shell>;
  if (!business) return null;
  const latest = business.history[business.history.length - 1];
  const submitted = me.decisionSubmitted;
  const canSubmit = room.phase === "decisions" && (!me.incident || Boolean(incidentOptionId));
  const phaseTitle = room.phase === "forecast" ? "Read the room." : room.phase === "decisions" ? "Make the call." : room.phase === "operations" ? "Watch it unfold." : "Count the result.";
  const timerLabel = room.phase === "decisions" ? submitted ? "SAVED" : "DECIDE" : room.phase === "operations" ? "LIVE" : room.phase.toUpperCase();
  return <Shell profile={profile}>
    <section className="game-heading"><div><div className="eyebrow">WEEK {room.day} OF {room.maxDays} · {getVenture(me.ventureId ?? "")?.name.toUpperCase()}</div><h1>{phaseTitle}</h1></div><Timer endsAt={room.phaseEndsAt} phase={timerLabel} /></section>
    <div className="metrics-strip"><Metric label="Cash" value={formatMoney(business.cash)} tone={business.cash < 500 ? "warn" : undefined} /><Metric label="Latest EBITDA" value={formatMoney(latest?.ebitda ?? 0)} tone={(latest?.ebitda ?? 0) >= 0 ? "good" : "warn"} /><Metric label="Inventory" value={formatMoney(business.inventoryValue)} tone={latest?.inventory.bloatSeverity !== "none" ? "warn" : undefined} /><Metric label="Team morale" value={`${business.morale}/100`} tone={business.morale < 40 ? "warn" : undefined} /><Metric label="Customer trust" value={`${business.trust}/100`} tone={business.trust < 40 ? "warn" : undefined} />{business.debt > 0 && <Metric label="Loan balance" value={formatMoney(business.debt)} tone="warn" />}</div>
    <div className="game-layout">
      <div>
        <div className="district-stage"><TycoonWorld players={room.players} day={room.day} phase={room.phase} phaseEndsAt={room.phaseEndsAt} directive={room.worldDirective} publicSignals={room.publicMarketSignals} marketEventId={room.marketEvent?.id} myPlayerId={profile.id} selectedPlayerId={room.phase === "decisions" ? intelPlayerId : undefined} onSelectPlayer={(id) => { if (id !== profile.id) setIntelPlayerId(id); }} />
          {room.phase === "decisions" && <CompetitorIntel room={room} selectedPlayerId={intelPlayerId} myPlayerId={profile.id} onSelect={setIntelPlayerId} previousInsight={latest?.insight} />}
        </div>
        <MarketCard room={room} />
        {room.phase === "results" && latest ? <ResultCard result={latest} /> : room.phase === "operations" && room.worldDirective ? <OperationsCard room={room} playerId={profile.id} /> : <section className={`decision-board ${room.phase !== "decisions" ? "decision-board--waiting" : ""}`}>
          <div className="decision-section"><div className="decision-number">1</div><div className="decision-content"><h2>Set this week’s price</h2><p>Lower prices attract more demand. Premium prices earn more per sale.</p><div className="choice-grid choice-grid--three">{(["budget", "standard", "premium"] as PriceTier[]).map((tier) => {
            const multipliers = { budget: "85% price · more demand", standard: "Base price · base demand", premium: "120% price · less demand" };
            return <button key={tier} disabled={room.phase !== "decisions"} onClick={() => setPriceTier(tier)} className={`choice-card ${priceTier === tier ? "choice-card--selected" : ""}`}><strong>{tier}</strong><span>{multipliers[tier]}</span></button>;
          })}</div></div></div>
          <div className="decision-section"><div className="decision-number">2</div><div className="decision-content"><h2>Choose one operating move</h2><p>Every move trades cash today for a different business advantage.</p><div className="action-grid">{ACTIONS.map((action) => <button key={action.id} disabled={room.phase !== "decisions"} onClick={() => setActionId(action.id)} className={`action-card ${actionId === action.id ? "action-card--selected" : ""}`}><span>{action.emoji}</span><div><strong>{action.name}</strong><small>{action.description}</small></div></button>)}</div></div></div>
          <div className="decision-section"><div className="decision-number">3</div><div className="decision-content"><h2>Plan inventory</h2><p>Stock supports sales, but unsold supply ties up cash on the balance sheet.</p><div className="choice-grid choice-grid--three">{([['lean', 'Lean', '82% of forecast · stockout risk'], ['balanced', 'Balanced', '105% · small safety stock'], ['stock_up', 'Stock up', '140% · cash-flow risk']] as const).map(([id, label, description]) => <button key={id} disabled={room.phase !== "decisions"} onClick={() => setInventoryPolicy(id)} className={`choice-card ${inventoryPolicy === id ? "choice-card--selected" : ""}`}><strong>{label}</strong><span>{description}</span></button>)}</div></div></div>
          <div className="decision-section"><div className="decision-number">4</div><div className="decision-content"><h2>Choose financing</h2><p>{room.interestRate?.label}: {(room.interestRate?.weeklyRateBps ?? 0) / 100}% for this simulated week. Planned debt is separate from the emergency rescue.</p><div className="choice-grid finance-grid">{([['none', 'No change', 'Keep the current balance'], ['borrow_500', 'Borrow $500', 'Adds cash and weekly interest'], ['borrow_1000', 'Borrow $1,000', 'More leverage, up to the credit limit'], ['repay_500', 'Repay $500', 'Requires a $500 cash reserve'], ['repay_all', 'Repay all', 'Uses available excess cash']] as const).map(([id, label, description]) => <button key={id} disabled={room.phase !== "decisions"} onClick={() => setFinancingAction(id)} className={`choice-card ${financingAction === id ? "choice-card--selected" : ""}`}><strong>{label}</strong><span>{description}</span></button>)}</div></div></div>
          <div className="decision-section"><div className="decision-number">5</div><div className="decision-content"><h2>Invest in capacity</h2><p>Expansion is a cash-flow investment and balance-sheet asset—not an EBITDA expense.</p><div className="choice-grid choice-grid--three">{([['none', 'No expansion', 'Keep current capacity'], ['capacity_small', '+10% capacity', '$500 capital investment'], ['capacity_large', '+20% capacity', '$1,000 capital investment']] as const).map(([id, label, description]) => <button key={id} disabled={room.phase !== "decisions" || (business.capacityBonusPct >= 40 && id !== 'none')} onClick={() => setCapitalInvestment(id)} className={`choice-card ${capitalInvestment === id ? "choice-card--selected" : ""}`}><strong>{label}</strong><span>{description}</span></button>)}</div><small className="decision-note">Current permanent capacity bonus: {business.capacityBonusPct}% · maximum 40%</small></div></div>
          {me.incident && <div className="decision-section incident-section"><div className="decision-number">!</div><div className="decision-content"><div className="incident-title"><span>{me.incident.emoji}</span><div><div className="tag">TODAY’S PEOPLE & OPERATIONS ISSUE</div><h2>{me.incident.title}</h2><p>{me.incident.description}</p></div></div><div className="choice-grid choice-grid--three">{me.incident.options.map((option) => <button key={option.id} disabled={room.phase !== "decisions"} onClick={() => setIncidentOptionId(option.id)} className={`choice-card ${incidentOptionId === option.id ? "choice-card--selected" : ""}`}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div></div></div>}
          <div className="submit-row"><div><small>{submitted ? "PLAN SAVED · EDITABLE UNTIL TIME EXPIRES" : "YOUR CALL"}</small><strong>{priceTier} price · {getAction(actionId)?.name} · {inventoryPolicy.replace("_", " ")} · {financingAction.replace("_", " ")}{me.incident ? " · incident handled" : ""}</strong></div><Button disabled={!canSubmit} onClick={() => onSubmit({ priceTier, actionId, incidentOptionId, financingAction, inventoryPolicy, capitalInvestment })}>{room.phase === "forecast" ? "Decision window opens next" : submitted ? "Update saved plan" : "Save my plan →"}</Button></div>
        </section>}
      </div>
      <Standings room={room} profileId={profile.id} />
    </div>
  </Shell>;
}

function CompetitorIntel({ room, selectedPlayerId, myPlayerId, onSelect, previousInsight }: { room: RoomSnapshot; selectedPlayerId: string; myPlayerId: string; onSelect: (id: string) => void; previousInsight?: NonNullable<PublicPlayer["business"]>["history"][number]["insight"] }) {
  const competitors = room.players.filter((player) => !player.spectator && player.id !== myPlayerId);
  const selected = competitors.find((player) => player.id === selectedPlayerId) ?? competitors[0];
  const signal = room.publicMarketSignals.find((item) => item.playerId === selected?.id);
  if (!selected || !signal) return null;
  return <aside className="competitor-intel" aria-label="Competitor Intel"><div className="competitor-intel__top"><div><div className="tag">COMPETITOR INTEL · PRIOR PUBLIC DATA</div><h2>{getVenture(selected.ventureId ?? "")?.emoji} {selected.nickname}</h2></div><select aria-label="Choose competitor" value={selected.id} onChange={(event) => onSelect(event.target.value)}>{competitors.map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}</select></div><p>Current-day choices stay secret until every plan is finalized.</p><div className="intel-grid"><span><small>LAST PRICE</small><b>{signal.observedPriceTier}</b></span><span><small>VISIBLE CAPACITY</small><b>{signal.visibleCapacity} · {signal.capacityLabel}</b></span><span><small>VISIBLE QUEUE</small><b>{signal.visibleQueue}</b></span><span><small>TRUST TREND</small><b>{signal.trustTrend}</b></span></div>{previousInsight && <div className={`carry-insight carry-insight--${previousInsight.severity}`}><small>YOUR CARRY-FORWARD INSIGHT</small><b>{previousInsight.title}</b><span>{previousInsight.nextMove}</span></div>}</aside>;
}

function OperationsCard({ room, playerId }: { room: RoomSnapshot; playerId: string }) {
  const plan = room.worldDirective?.businesses.find((item) => item.playerId === playerId);
  if (!plan) return null;
  const movements = room.worldDirective?.customerCohorts.filter((cohort) => cohort.originPlayerId === playerId || cohort.destinationPlayerId === playerId).slice(0, 3) ?? [];
  const icon = { price: "$$", wait: "⌛", trust: "♥", marketing: "📣", capacity: "+" } as const;
  return <section className="operations-card"><div><div className="tag">LIVE OPERATIONS · ORGANIC COMPETITION</div><h2>The district is responding to everyone’s decisions.</h2><p>The books are still open. Every movement traces back to price, wait, trust, marketing, or capacity—never an attack card.</p>{movements.length > 0 && <div className="movement-feed">{movements.map((cohort) => { const destination = room.players.find((player) => player.id === cohort.destinationPlayerId); const leaving = cohort.originPlayerId === playerId; return <div key={cohort.id}><span>{icon[cohort.reason]}</span><p><b>{cohort.actualCustomers} customers {leaving ? `chose ${destination?.nickname}` : "chose you"}</b><small>{cohort.reasonLabel}</small></p></div>; })}</div>}</div><div className="operations-kpis"><span><b>{plan.trafficTarget}</b> potential visits</span><span><b>{plan.conversionRate}%</b> served</span><span><b>{plan.averageWaitSeconds}s</b> average wait</span><span><b>{plan.satisfaction}%</b> satisfaction</span></div></section>;
}

function MarketCard({ room }: { room: RoomSnapshot }) {
  const event = room.marketEvent;
  if (!event) return null;
  return <section className="market-card"><div className="market-card__icon">{event.emoji}</div><div><div className="tag">WEEKLY CITY FORECAST</div><h2>{event.name}</h2><p>{event.description}</p>{room.interestRate && <div className={`rate-forecast rate-forecast--${room.interestRate.id}`}><b>🏦 {room.interestRate.label} · {room.interestRate.weeklyRateBps / 100}%</b><span>{room.interestRate.description}</span></div>}</div><span className="pulse-label"><i /> LIVE</span></section>;
}

function ResultCard({ result }: { result: NonNullable<PublicPlayer["business"]>["history"][number] }) {
  const bridge = result.cashBridge;
  const costs = bridge.inventoryPurchases + bridge.payroll + bridge.overhead + bridge.operatingActions + bridge.incidents + bridge.recruitmentAndRetraining + bridge.interestAndFees;
  const actionMovement = -(bridge.operatingActions + bridge.incidents + bridge.recruitmentAndRetraining);
  const bars = [
    { label: "Start", value: bridge.beginningCash, kind: "balance" },
    { label: "Receipts", value: bridge.customerReceipts, kind: "positive" },
    { label: "Inventory", value: -bridge.inventoryPurchases, kind: "negative" },
    { label: "Payroll", value: -bridge.payroll, kind: "negative" },
    { label: "Overhead", value: -bridge.overhead, kind: "negative" },
    { label: "Actions", value: actionMovement, kind: actionMovement >= 0 ? "positive" : "negative" },
    { label: "End", value: bridge.endingCash, kind: "balance" }
  ];
  const scale = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);
  const operatingCashFlow = result.revenue - result.inventory.purchaseCashOutflow - result.expenseBreakdown.payroll - result.expenseBreakdown.overhead - result.expenseBreakdown.operatingActions - result.expenseBreakdown.incidents - result.expenseBreakdown.recruitmentAndRetraining - result.expenseBreakdown.interest - result.expenseBreakdown.loanFees;
  return <section className="result-card"><div className="result-top"><div><div className="tag">WEEK {result.day} BOOKS CLOSED</div><h2>{result.profit >= 0 ? "A profitable week." : "A costly lesson."}</h2></div><strong className={result.profit >= 0 ? "profit-positive" : "profit-negative"}>{result.profit >= 0 ? "+" : ""}{formatMoney(result.profit)}</strong></div><div className="weekly-accounting-strip"><span><small>EBITDA</small><b>{formatMoney(result.ebitda)}</b></span><span><small>NET INCOME</small><b>{formatMoney(result.profit)}</b></span><span className={operatingCashFlow < 0 ? "warn" : ""}><small>OPERATING CASH FLOW</small><b>{formatMoney(operatingCashFlow)}</b></span><span><small>ENDING INVENTORY</small><b>{formatMoney(result.inventory.endingValue)}</b></span></div><div className="daily-waterfall" role="img" aria-label={`Cash bridge from ${formatMoney(bridge.beginningCash)} to ${formatMoney(bridge.endingCash)} with ${formatMoney(bridge.customerReceipts)} of receipts and ${formatMoney(costs)} of operating costs.`}>{bars.map((bar) => <div className={`cash-bar cash-bar--${bar.kind}`} key={bar.label}><b>{bar.value > 0 && bar.kind !== "balance" ? "+" : ""}{formatMoney(bar.value)}</b><i style={{ height: `${Math.max(12, Math.round(Math.abs(bar.value) / scale * 100))}%` }} /><span>{bar.label}</span></div>)}</div>{result.turnover.triggered && <div className="event-ledger event-ledger--turnover"><b>👋 Resignation event</b><span>{formatMoney(result.turnover.recruitmentExpense)} recruitment &amp; retraining expense · one-week vacancy disruption</span></div>}{result.inventory.bloatSeverity !== "none" && <div className="event-ledger event-ledger--inventory"><b>📦 Inventory bloat</b><span>{result.inventory.weeksOfInventoryOnHand} weeks of stock remains. Net income exceeded operating cash flow by {formatMoney(result.inventory.cashConversionGap)}.</span></div>}<div className={`daily-insight daily-insight--${result.insight.severity}`}><span>{result.insight.severity === "positive" ? "↗" : "⚠"}</span><div><small>{result.insight.severity === "positive" ? "NEXT-WEEK SIGNAL" : "ACTION REQUIRED"}</small><b>{result.insight.title}</b><p>{result.insight.explanation}</p><strong>Next week: {result.insight.nextMove}</strong></div></div><p className="explanation">💡 {result.explanation}</p>{result.incidentTitle && <p className="incident-recap">{result.incidentTitle}: <b>{result.incidentChoice}</b></p>}</section>;
}

function Finished({ room, profile, onRematch, onRefreshProfile }: { room: RoomSnapshot; profile: Profile; onRematch: () => void; onRefreshProfile: () => void }) {
  const me = room.players.find((player) => player.id === profile.id)!;
  const myRank = room.rankings?.find((entry) => entry.playerId === profile.id);
  const lesson = me.business ? decisionLesson(me.business) : undefined;
  useEffect(() => { onRefreshProfile(); }, []);
  return <Shell profile={profile}>
    <section className="finish-hero"><div className="eyebrow">THE SIX-WEEK MARKET HAS CLOSED</div><div className="trophy">{myRank?.rank === 1 ? "🏆" : myRank?.insolvent ? "🧭" : "📊"}</div><h1>{myRank?.rank === 1 ? "You built the most valuable company." : myRank?.insolvent ? "Every setback teaches the next move." : `You finished #${myRank?.rank}.`}</h1><p>{myRank?.rank === 1 ? "Sustainable EBITDA, brand trust, workforce stability, and disciplined leverage put you on top." : "Review the valuation and cash-conversion decisions that moved your company."}</p>{me.reward !== undefined && <div className="reward-pill">+{me.reward} TOKENS EARNED</div>}</section>
    <div className="finish-layout">
      <section className="final-rankings"><div className="panel-title"><h2>Final rankings</h2><span>COMPANY VALUATION</span></div>{room.rankings?.map((entry) => {
        const player = room.players.find((item) => item.id === entry.playerId)!;
        return <div className={`final-row ${entry.playerId === profile.id ? "final-row--me" : ""}`} key={entry.playerId}><b>#{entry.rank}</b><span>{getVenture(player.ventureId ?? "")?.emoji}</span><div><strong>{player.nickname}</strong><small>{entry.insolvent ? "Insolvent · learning mode" : `${formatMoney(entry.valuationBreakdown.finalWeekEbitda)} final-week EBITDA · ${entry.morale} morale`}</small></div><em>{formatMoney(entry.companyValuation)}</em></div>;
      })}</section>
      {lesson && myRank && <aside className="debrief"><div className="tag">YOUR COMPANY VALUATION</div><h2>{formatMoney(myRank.companyValuation)}</h2><div className="valuation-formula"><span><b>{formatMoney(myRank.valuationBreakdown.finalWeekEbitda)}</b><small>Week 6 EBITDA</small></span><i>× 52 × {myRank.valuationBreakdown.ebitdaMultiple}</i><span><b>{myRank.valuationBreakdown.brandFactor}× · {myRank.valuationBreakdown.stabilityFactor}×</b><small>Brand · stability</small></span><i>+</i><span><b>{formatMoney(myRank.valuationBreakdown.excessCash)}</b><small>Excess cash</small></span><i>−</i><span><b>{formatMoney(myRank.valuationBreakdown.outstandingDebt)}</b><small>Debt</small></span></div><div className="debrief-item debrief-item--good"><span>↗</span><div><small>MOST PROFITABLE</small><strong>{lesson.best}</strong></div></div><div className="debrief-item debrief-item--warn"><span>↘</span><div><small>COSTLIEST WEEK</small><strong>{lesson.costly}</strong></div></div><p>💡 {lesson.lesson}</p>{me.isHost ? <Button onClick={onRematch}>Open rematch lobby →</Button> : <small>Waiting for the host to open a rematch.</small>}</aside>}
    </div>
    {room.rankings && <FinancialCenter players={room.players} rankings={room.rankings} />}
  </Shell>;
}

export function App() {
  const [profile, setProfile] = useState<Profile>();
  const [credential, setCredential] = useState<string>();
  const [restoring, setRestoring] = useState(true);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot>();
  const [toast, setToast] = useState<string>();
  const roomRef = useRef<RoomSnapshot | undefined>(undefined);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    const saved = localStorage.getItem(CREDENTIAL_KEY);
    if (!saved) { setRestoring(false); return; }
    restoreOrCreateProfile(saved).then((result) => {
      localStorage.setItem(CREDENTIAL_KEY, result.credential); setCredential(result.credential); setProfile(result.profile);
    }).catch(() => notify("Could not restore your profile. Refresh to retry; your saved credential is safe.")).finally(() => setRestoring(false));
  }, []);

  const acceptSnapshot = useCallback((next: RoomSnapshot) => {
    const current = roomRef.current;
    if (current?.code === next.code && next.revision < current.revision) return;
    roomRef.current = next;
    localStorage.setItem(ROOM_KEY, next.code);
    setRoom(next);
  }, []);

  useEffect(() => {
    if (!credential) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const code = roomRef.current?.code ?? localStorage.getItem(ROOM_KEY) ?? undefined;
        const result = await gameRequest(credential, code ? (roomRef.current ? "room:poll" : "room:join") : "catalog", {}, code);
        if (stopped) return;
        setConnected(true);
        if (result.snapshot) acceptSnapshot(result.snapshot);
      } catch (error) {
        if (stopped) return;
        setConnected(false);
        if (error instanceof Error && /expired|does not exist/.test(error.message)) {
          localStorage.removeItem(ROOM_KEY); roomRef.current = undefined; setRoom(undefined);
        }
      } finally {
        if (!stopped) timer = setTimeout(poll, roomRef.current ? 1000 : 5000);
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [credential, acceptSnapshot]);

  const emit = useCallback(async <T,>(event: string, payload: unknown = {}): Promise<T> => {
    const current = roomRef.current;
    const guarded = event === "game:decision" ? { ...(payload as object), matchId: current?.matchId, day: current?.day } : payload;
    const result = await gameRequest<T>(credential, event, guarded, event === "room:join" ? undefined : current?.code);
    if (result.snapshot) acceptSnapshot(result.snapshot);
    return result.data;
  }, [credential, acceptSnapshot]);

  const act = useCallback(async (event: string, payload?: unknown) => {
    try { await emit(event, payload); } catch (error) { notify(error instanceof Error ? error.message : "That action failed."); }
  }, [emit, notify]);

  const createProfile = async (nickname: string) => {
    setRestoring(true);
    try {
      const result = await restoreOrCreateProfile(undefined, nickname);
      localStorage.setItem(CREDENTIAL_KEY, result.credential); setCredential(result.credential); setProfile(result.profile);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create your profile."); }
    finally { setRestoring(false); }
  };

  const refreshProfile = useCallback(async () => {
    if (!credential) return;
    try { const result = await loadCatalog(credential); setProfile(result.profile); } catch { /* next home visit retries */ }
  }, [credential]);

  if (restoring) return <div className="loading-screen"><Logo /><div className="loading-bar"><span /></div><p>Opening the market…</p></div>;
  if (!profile || !credential) return <><Onboarding onCreate={createProfile} busy={restoring} />{toast && <Toast message={toast} onDismiss={() => setToast(undefined)} />}</>;

  let content: ReactNode;
  if (!room) {
    content = <Home profile={profile} credential={credential} connected={connected} onProfile={setProfile} notify={notify}
      onCreateRoom={() => act("room:create")}
      onSolo={async () => {
        try {
          await emit<{ code: string }>("room:create");
          await emit("room:add-bot"); await emit("room:add-bot"); await emit("room:add-bot");
          notify("Solo room ready: three bot founders joined you.");
        } catch (error) { notify(error instanceof Error ? error.message : "Could not open a solo room."); }
      }}
      onJoinRoom={(code) => act("room:join", { code })} />;
  } else if (room.phase === "lobby") {
    content = <Lobby room={room} profile={profile} notify={notify} onSelect={(ventureId) => act("room:select-venture", { ventureId })} onReady={(ready) => act("room:ready", { ready })} onPace={(pace) => act("room:pace", { pace })} onRounds={(rounds) => act("room:rounds", { rounds })} onStart={() => act("game:start")} onAddBot={() => act("room:add-bot")} onRemoveBot={(botId) => act("room:remove-bot", { botId })} />;
  } else if (room.phase === "finished") {
    content = <Finished room={room} profile={profile} onRematch={() => act("game:rematch")} onRefreshProfile={refreshProfile} />;
  } else {
    content = <Game room={room} profile={profile} onSubmit={(decision) => act("game:decision", decision)} />;
  }
  return <>{content}{toast && <Toast message={toast} onDismiss={() => setToast(undefined)} />}</>;
}
