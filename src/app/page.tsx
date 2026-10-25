"use client";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { RANKS, rankForLevel, nextRank, xpForNextLevel } from "@/lib/ranks";

type Quest = { id: string; title: string; description: string; category: string; difficulty: string; xp_reward: number; gold_reward: number; is_dungeon: boolean; status?: string; };
type Profile = { id: string; username: string; display_name: string | null; level: number; current_xp: number; total_xp: number; gold_balance: number; };
type ProofRow = { id: string; status: string; created_at: string; quest_id: string; admin_note?: string | null; };

const SEED_QUESTS: Quest[] = [
  {id:"study",title:"Focused study session",description:"Study one topic for 25 minutes, with a short break afterward.",category:"intelligence",difficulty:"normal",xp_reward:45,gold_reward:8,is_dungeon:false},
  {id:"movement",title:"Move with intent",description:"Complete a safe workout, walk, or mobility session.",category:"strength",difficulty:"normal",xp_reward:40,gold_reward:8,is_dungeon:false},
  {id:"plan",title:"Set today's priorities",description:"Write three realistic priorities and choose the first action.",category:"discipline",difficulty:"easy",xp_reward:20,gold_reward:4,is_dungeon:false},
  {id:"build",title:"Make tangible progress",description:"Spend focused time on a project, design, or coding task.",category:"creativity",difficulty:"hard",xp_reward:65,gold_reward:12,is_dungeon:false},
  {id:"read",title:"Read and summarize",description:"Read for 15 minutes and write one thing you learned.",category:"intelligence",difficulty:"easy",xp_reward:20,gold_reward:4,is_dungeon:false},
  {id:"social",title:"Intentional offline block",description:"Choose a short planned block away from entertainment feeds. Report honestly; no device monitoring is performed.",category:"discipline",difficulty:"normal",xp_reward:35,gold_reward:6,is_dungeon:false},
  {id:"dungeon-study",title:"DUNGEON: Deep Work Trial",description:"A planned 3-hour study block with reasonable breaks. Upload a session log or other evidence. Do not sacrifice sleep or health to finish it.",category:"intelligence",difficulty:"dungeon",xp_reward:120,gold_reward:25,is_dungeon:true},
  {id:"dungeon-feed",title:"DUNGEON: Feed-Free Evening",description:"Set a realistic evening window away from social feeds. Optional screen-time summary can support your self-report but cannot prove attention.",category:"discipline",difficulty:"dungeon",xp_reward:75,gold_reward:18,is_dungeon:true}
];
const NAV = ["Dashboard","Quest board","Proof history","Ranks","Admin reports","Profile"];
const navKey = (s:string) => s.toLowerCase().replaceAll(" ","-");

export default function Home() {
  const [configured,setConfigured] = useState(true);
  const [session,setSession] = useState<any>(null);
  const [authMode,setAuthMode] = useState<"login"|"signup">("login");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authMessage,setAuthMessage] = useState("");
  const [profile,setProfile] = useState<Profile|null>(null);
  const [active,setActive] = useState("Dashboard");
  const [quests,setQuests] = useState<Quest[]>(SEED_QUESTS);
  const [proofs,setProofs] = useState<ProofRow[]>([]);
  const [dailyXp,setDailyXp] = useState(0);
  const [pendingQuest,setPendingQuest] = useState<Quest|null>(null);
  const [proofFile,setProofFile] = useState<File|null>(null);
  const [proofNote,setProofNote] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [allProfiles,setAllProfiles] = useState<any[]>([]);
  const [adminProofs,setAdminProofs] = useState<any[]>([]);
  const [isAdmin,setIsAdmin] = useState(false);
  const [customName,setCustomName] = useState("");
  const [customDesc,setCustomDesc] = useState("");
  const [customCategory,setCustomCategory] = useState("intelligence");
  const [customDifficulty,setCustomDifficulty] = useState("normal");
  const supabase = useMemo(() => { try { return getSupabase(); } catch { return null; } }, []);

  useEffect(() => {
    if (!supabase) { setConfigured(false); return; }
    supabase.auth.getSession().then(({data}:any) => setSession(data.session));
    const {data} = supabase.auth.onAuthStateChange((_event:string,next:any) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => { if (session?.user && supabase) loadAccount(); }, [session?.user?.id]);

  async function loadAccount() {
    if (!supabase || !session?.user) return;
    const {data:prof} = await supabase.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
    if (prof) { setProfile(prof); setCustomName(prof.display_name || prof.username || ""); }
    const {data:tasks} = await supabase.from("user_quests").select("id, title, description, category, difficulty, xp_reward, gold_reward, is_dungeon, status").eq("user_id",session.user.id).order("created_at",{ascending:false});
    if (tasks?.length) setQuests(tasks);
    const {data:history} = await supabase.from("proof_submissions").select("id,status,created_at,quest_id,admin_note").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(100);
    if (history) setProofs(history);
    const start = new Date(); start.setHours(0,0,0,0);
    const {data:ledger} = await supabase.from("xp_ledger").select("amount,is_dungeon,created_at").eq("user_id",session.user.id).gte("created_at",start.toISOString());
    if (ledger) setDailyXp(ledger.filter((x:any)=>!x.is_dungeon).reduce((sum:number,x:any)=>sum+x.amount,0));
    const {data:role} = await supabase.from("profiles").select("is_admin").eq("id",session.user.id).maybeSingle();
    const admin = !!role?.is_admin; setIsAdmin(admin);
    if (admin) {
      const {data:users} = await supabase.from("profiles").select("id,username,display_name,level,current_xp,total_xp,gold_balance").order("total_xp",{ascending:false}).limit(500);
      const {data:review} = await supabase.from("proof_submissions").select("id,user_id,quest_id,status,created_at,admin_note,evidence_path,reviewed_at").order("created_at",{ascending:false}).limit(1000);
      setAllProfiles(users || []); setAdminProofs(review || []);
    }
  }

  async function submitAuth(e:React.FormEvent) {
    e.preventDefault(); if (!supabase) return; setBusy(true); setAuthMessage("");
    const result = authMode==="signup"
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password});
    setBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode==="signup") setAuthMessage("Account request sent. If email confirmation is enabled, verify your email before logging in.");
    else setAuthMessage("Signed in. Loading hunter profile…");
  }
  async function signOut(){ if(supabase) await supabase.auth.signOut(); setSession(null); setProfile(null); }
  function notify(text:string){setMessage(text);setTimeout(()=>setMessage(""),4000);}
  function openProof(q:Quest){setPendingQuest(q);setProofFile(null);setProofNote("");}
  async function submitProof(e:React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session?.user || !profile || !pendingQuest) return;
    if (!proofFile) {notify("Attach a screenshot, image, or PDF as evidence.");return;}
    if (proofFile.size > 8*1024*1024) {notify("Evidence must be 8 MB or smaller.");return;}
    const allowed = ["image/png","image/jpeg","image/webp","application/pdf"];
    if (!allowed.includes(proofFile.type)) {notify("Only PNG, JPG, WEBP, and PDF files are allowed.");return;}
    setBusy(true);
    const path = `${session.user.id}/${crypto.randomUUID()}-${proofFile.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const {error:uploadError} = await supabase.storage.from("quest-evidence").upload(path,proofFile,{contentType:proofFile.type,upsert:false});
    if (uploadError) {setBusy(false);notify("Upload failed: "+uploadError.message);return;}
    const {error:submitError} = await supabase.from("proof_submissions").insert({
      user_id:session.user.id, quest_id:pendingQuest.id, evidence_path:path, note:proofNote.slice(0,1000), status:"pending"
    });
    setBusy(false);
    if (submitError) {notify("Submission failed: "+submitError.message);return;}
    setPendingQuest(null);notify("Proof submitted for admin review.");await loadAccount();
  }
  async function createQuest(e:React.FormEvent) {
    e.preventDefault(); if(!supabase || !session?.user || !profile) return;
    const xpMap:any = {easy:20,normal:40,hard:60};
    const quest = {user_id:session.user.id,title:customName.trim(),description:customDesc.trim(),category:customCategory,difficulty:customDifficulty,xp_reward:xpMap[customDifficulty],gold_reward:Math.ceil(xpMap[customDifficulty]/5),is_dungeon:false,status:"assigned"};
    if(!quest.title) return;
    const {error} = await supabase.from("user_quests").insert(quest);
    if(error){notify(error.message);return}
    setCustomName("");setCustomDesc("");notify("Quest created.");await loadAccount();
  }
  async function reviewProof(row:any,approve:boolean) {
    if(!supabase || !isAdmin) return;
    const {data,error} = await supabase.rpc("review_quest_proof",{p_submission_id:row.id,p_approve:approve,p_admin_note:approve?"Approved by admin":"Please review the evidence and try again."});
    if(error){notify("Review failed: "+error.message);return}
    notify(approve?"Proof approved; rewards issued by database transaction.":"Proof rejected.");
    await loadAccount();
  }
  async function downloadEvidence(path:string) {
    if(!supabase || !isAdmin) return;
    const {data,error} = await supabase.storage.from("quest-evidence").createSignedUrl(path,60);
    if(error || !data?.signedUrl){notify("Could not create evidence download link.");return}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  function downloadCsv() {
    if(!isAdmin) return;
    const rows = [["username","display_name","level","total_xp","current_xp","gold_balance"],...allProfiles.map(p=>[p.username,p.display_name,p.level,p.total_xp,p.current_xp,p.gold_balance])];
    const csv = rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`hunter-stats-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  }

  async function downloadDailyReport() {
    if (!supabase || !isAdmin) return;
    const start = new Date(); start.setHours(0,0,0,0);
    const {data,error} = await supabase.from("stat_events")
      .select("user_id,quest_id,category,points,created_at")
      .gte("created_at",start.toISOString()).order("created_at",{ascending:true});
    if (error) { notify("Daily report failed: "+error.message); return; }
    const rows = [["date_time","user_id","quest_id","section","points"],...(data||[]).map((x:any)=>[x.created_at,x.user_id,x.quest_id,x.category,x.points])];
    const csv = rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\\r\\n");
    const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`hunter-daily-section-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  }

  if (!configured) return <div className="auth-wrap"><div className="wordmark"><div className="sigil"><span>H</span></div><div><b>HUNTER SYSTEM</b><small>ACCOUNT NETWORK / SETUP REQUIRED</small></div></div><div className="auth-card" style={{marginTop:25}}><div className="kicker">SYSTEM INITIALIZATION</div><h1>Connect the database.</h1><p>This build uses real Supabase accounts, private evidence storage, and server-validated XP. Configure the environment variables before running it.</p><ol className="note"><li>Create a Supabase project.</li><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Set your project URL and anon key.</li><li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li></ol><p>Until these steps are complete, account and proof features are intentionally disabled.</p></div></div>;

  if (!session) return <div className="auth-wrap"><div className="wordmark"><div className="sigil"><span>H</span></div><div><b>HUNTER SYSTEM</b><small>REAL-LIFE PROGRESSION NETWORK</small></div></div><div className="auth-card"><div className="kicker">AUTHENTICATION / 00</div><h1>{authMode==="login"?"Return, Hunter.":"Begin your awakening."}</h1><p>Your progress follows your account. Sign in from any device to continue your journey.</p><div className="auth-tabs"><button className={authMode==="login"?"active":""} onClick={()=>setAuthMode("login")}>Sign in</button><button className={authMode==="signup"?"active":""} onClick={()=>setAuthMode("signup")}>Create account</button></div><form onSubmit={submitAuth}><label>EMAIL ADDRESS</label><input className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="hunter@example.com"/><label>PASSWORD</label><input className="field" type="password" minLength={8} autoComplete={authMode==="login"?"current-password":"new-password"} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/><button className="button" style={{width:"100%"}} disabled={busy}>{busy?"PLEASE WAIT…":authMode==="login"?"SIGN IN":"CREATE ACCOUNT"}</button></form>{authMessage&&<div className="message">{authMessage}</div>}<p className="note">By continuing, you agree to use the quest system honestly. Do not upload sensitive personal documents as proof.</p></div></div>;

  const level=profile?.level||1, currentXp=profile?.current_xp||0, threshold=xpForNextLevel(level), rank=rankForLevel(level), next=nextRank(level);
  const visibleRanks=RANKS.filter(r=>r.level<=level+1).slice(-12);
  const todaysNormalLeft=Math.max(0,280-dailyXp);
  const activeQuests=quests.filter(q=>q.status!=="completed");
  const proofStatus=(questId:string)=>proofs.find(p=>p.quest_id===questId&&p.status==="pending");
  const titleFor=(q:Quest)=>q.is_dungeon?"DUNGEON":q.difficulty.toUpperCase();
  const navClick=(n:string)=>{setActive(n);setPendingQuest(null);};

  return <div className="shell">
    <header className="masthead"><div className="wordmark"><div className="sigil"><span>H</span></div><div><b>HUNTER SYSTEM</b><small>REAL-LIFE PROGRESSION NETWORK</small></div></div><div className="status">● SESSION ACTIVE</div></header>
    <div className="layout"><aside className="side">{NAV.filter(n=>n!=="Admin reports"||isAdmin).map(n=><button key={n} className={active===n?"active":""} onClick={()=>navClick(n)}>{n}</button>)}<div className="side-note">SYSTEM BUILD 0.2<br/>PROOF REVIEW ENABLED<br/>YOUR DATA / PRIVATE</div></aside>
    <main className="main">
      {message&&<div className="notice" style={{marginBottom:14}}>{message}</div>}
      {active==="Dashboard"&&<section className="view active">
        <div className="title-row"><div><div className="kicker">PLAYER OVERVIEW / 01</div><h1>System status.</h1><div className="subtitle">Small actions. Measurable progress.</div></div><button className="button" onClick={()=>setActive("Quest board")}>VIEW QUESTS ↗</button></div>
        <div className="player-panel"><div className="player-head"><div className="player-id"><div className="crest">H</div><div><div className="rankline">{rank.name} RANK</div><div className="player-name">{(profile?.display_name||profile?.username||"HUNTER").toUpperCase()}</div><div className="rank-title">{rank.title}</div></div></div><div className="level-num"><small>LEVEL</small><b>{String(level).padStart(2,"0")}</b></div></div><div className="xp"><div className="xp-line"><span>EXPERIENCE</span><span>{currentXp} / {threshold} XP</span></div><div className="bar"><div className="bar-fill" style={{width:`${Math.min(100,currentXp/threshold*100)}%`}}/></div><div className="tiny">{threshold-currentXp} XP until Level {level+1} · {profile?.gold_balance||0} GOLD</div></div></div>
        <div className="stats">{[{name:"STRENGTH",value:10,desc:"Training consistency"},{name:"INTELLIGENCE",value:10,desc:"Learning sessions"},{name:"DISCIPLINE",value:10,desc:"Intentional habits"},{name:"CREATIVITY",value:10,desc:"Project progress"}].map(s=><div className="stat" key={s.name}><div className="stat-label">{s.name}</div><strong>{s.value}</strong><small>{s.desc}</small></div>)}</div>
        <div className="columns"><div className="panel"><div className="panel-head"><h2>Available quests</h2><span className="mono">{activeQuests.length} OPEN</span></div>{activeQuests.slice(0,5).map(q=><div className="quest" key={q.id}><div className="quest-mark">{q.is_dungeon?"D":"+"}</div><div><b>{q.title}</b><small>{q.description}</small><div className="reward">+{q.xp_reward} XP · +{q.gold_reward} GOLD</div></div><button className="mini-btn" onClick={()=>openProof(q)}>{proofStatus(q.id)?"PENDING":"SUBMIT"}</button></div>)}{!activeQuests.length&&<div className="empty">No open quests. Create one in Quest Board.</div>}</div><div><div className="panel"><div className="panel-head"><h2>Daily XP limit</h2><span className="mono">STANDARD</span></div><div style={{font:'25px "IBM Plex Mono"',margin:"12px 0"}}>{dailyXp} <span style={{fontSize:12,color:"var(--muted)"}}>/ 280 XP</span></div><div className="bar"><div className="bar-fill" style={{width:`${Math.min(100,dailyXp/280*100)}%`}}/></div><p className="note">Standard quests share a 280 XP daily cap. Dungeon rewards are tracked separately and require review.</p></div><div className="panel"><div className="panel-head"><h2>Next classification</h2><span className="mono">{next?next.name:"MAX"}</span></div><p style={{fontSize:12,lineHeight:1.7,color:"var(--muted)"}}>{next?`Your next hidden rank unlocks at Level ${next.level}. Keep completing approved quests to reveal it.`:"Top classification reached."}</p><button className="button secondary" onClick={()=>setActive("Ranks")}>VIEW CLASSIFICATION</button></div></div></div>
      </section>}
      {active==="Quest board"&&<section className="view active"><div className="title-row"><div><div className="kicker">MISSION REGISTER / 02</div><h1>Quest board.</h1><div className="subtitle">Attach evidence for admin review before rewards are issued.</div></div></div><div className="notice" style={{marginBottom:14}}>Standard quest rewards are capped at 280 XP per day. Special dungeon quests can award bonus XP after proof review. Evidence supports review but does not guarantee a task's internal conditions can be verified.</div><div className="panel"><div className="panel-head"><h2>System quests</h2><span className="mono">TEMPLATE MISSIONS</span></div>{SEED_QUESTS.map(q=><div className="quest" key={q.id}><div className="quest-mark">{q.is_dungeon?"D":"+"}</div><div><b>{q.title}</b><small>{q.description}</small><div className="reward">{titleFor(q)} · +{q.xp_reward} XP · +{q.gold_reward} GOLD</div></div><button className="mini-btn" onClick={()=>openProof(q)}>{proofStatus(q.id)?"PENDING":"UPLOAD PROOF"}</button></div>)}</div><div className="panel"><div className="panel-head"><h2>Create a personal quest</h2><span className="mono">SELF-DIRECTED</span></div><form onSubmit={createQuest}><label>QUEST TITLE</label><input className="field" required maxLength={90} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="e.g. Complete one programming exercise"/><label>DESCRIPTION / ACCEPTANCE CRITERIA</label><textarea className="field" maxLength={500} value={customDesc} onChange={e=>setCustomDesc(e.target.value)} placeholder="What will count as completion?" rows={3}/><div className="form-row"><div><label>ATTRIBUTE</label><select className="field" value={customCategory} onChange={e=>setCustomCategory(e.target.value)}><option value="intelligence">Intelligence</option><option value="strength">Strength</option><option value="discipline">Discipline</option><option value="creativity">Creativity</option></select></div><div><label>DIFFICULTY</label><select className="field" value={customDifficulty} onChange={e=>setCustomDifficulty(e.target.value)}><option value="easy">Easy · 20 XP</option><option value="normal">Normal · 40 XP</option><option value="hard">Hard · 60 XP</option></select></div></div><button className="button">CREATE QUEST</button></form><p className="note">Personal quest rewards are intentionally modest. The server enforces daily limits when the schema is installed.</p></div></section>}
      {active==="Proof history"&&<section className="view active"><div className="title-row"><div><div className="kicker">EVIDENCE ARCHIVE / 03</div><h1>Proof history.</h1><div className="subtitle">See what you submitted and whether it was reviewed.</div></div></div><div className="panel">{proofs.map(p=><div className="quest" key={p.id}><div className="quest-mark">{p.status==="approved"?"✓":p.status==="rejected"?"×":"…"}</div><div><b>{p.quest_id}</b><small>{new Date(p.created_at).toLocaleString()} · {p.admin_note||"No review note"}</small><div className="reward">{p.status.toUpperCase()}</div></div></div>)}{!proofs.length&&<div className="empty">No proof submissions yet.</div>}</div></section>}
      {active==="Ranks"&&<section className="view active"><div className="title-row"><div><div className="kicker">CLASSIFICATION INDEX / 04</div><h1>Hunter ranks.</h1><div className="subtitle">The next classification stays obscured until you approach it.</div></div></div><div className="panel"><div className="panel-head"><h2>Discovered classifications</h2><span className="mono">{RANKS.filter(r=>r.level<=level).length} / {RANKS.length} DISCOVERED</span></div><div className="ranks">{visibleRanks.map(r=><div className={`rank-tile ${r.name===rank.name?"current":""}`} key={r.name}><b>{r.level<=level?r.name:"???"}</b><small>{r.level<=level?r.title:`LV ${r.level}`}</small></div>)}</div><p className="note">There are {RANKS.length} classifications in this prototype. Hidden names are revealed as you reach each level threshold. Rank labels are original game mechanics, not official anime canon.</p></div><div className="panel"><h2>Progression protocol</h2><p className="note">Level requirements grow over time. Standard quest XP decreases relative to the effort required at higher levels; harder levels should require more approved completions. Standard XP is capped at 280 per calendar day. Dungeon rewards are separate and only issued by the database review function.</p></div></section>}
      {active==="Admin reports"&&isAdmin&&<section className="view active"><div className="title-row"><div><div className="kicker">ADMIN / 05</div><h1>Review console.</h1><div className="subtitle">Review evidence and export account-level stats.</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="button secondary" onClick={downloadDailyReport}>DOWNLOAD DAILY SECTION REPORT</button><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="button secondary" onClick={downloadDailyReport}>DOWNLOAD DAILY SECTION REPORT</button><button className="button" onClick={downloadCsv}>DOWNLOAD USER CSV</button></div></div></div><div className="stats"><div className="stat"><div className="stat-label">REGISTERED HUNTERS</div><strong>{allProfiles.length}</strong></div><div className="stat"><div className="stat-label">SUBMISSIONS</div><strong>{adminProofs.length}</strong></div><div className="stat"><div className="stat-label">PENDING REVIEW</div><strong>{adminProofs.filter(p=>p.status==="pending").length}</strong></div><div className="stat"><div className="stat-label">APPROVED</div><strong>{adminProofs.filter(p=>p.status==="approved").length}</strong></div></div><div className="panel"><div className="panel-head"><h2>Evidence review queue</h2><span className="mono">PRIVATE STORAGE</span></div>{adminProofs.map(p=><div className="quest" key={p.id}><div className="quest-mark">{p.status==="pending"?"…":p.status==="approved"?"✓":"×"}</div><div><b>{p.quest_id} · {p.user_id.slice(0,8)}</b><small>{new Date(p.created_at).toLocaleString()} · {p.status}</small><div className="reward">{p.admin_note||"No note"}</div></div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button className="mini-btn" onClick={()=>downloadEvidence(p.evidence_path)}>DOWNLOAD</button>{p.status==="pending"&&<><button className="mini-btn" onClick={()=>reviewProof(p,true)}>APPROVE</button><button className="mini-btn" onClick={()=>reviewProof(p,false)}>REJECT</button></>}</div></div>)}{!adminProofs.length&&<div className="empty">No submissions to review.</div>}</div><div className="panel"><div className="panel-head"><h2>Hunter stats</h2><span className="mono">EXPORTABLE</span></div>{allProfiles.map(p=><div className="quest" key={p.id}><div className="quest-mark">{p.level}</div><div><b>{p.display_name||p.username}</b><small>Level {p.level} · {p.total_xp} lifetime XP · {p.gold_balance} gold</small></div><span className="mono">{p.username}</span></div>)}</div><p className="note">This export is an account snapshot. Detailed daily section reports require aggregating approved quest completions and stat events, which can be added to the reporting migration.</p></section>}
      {active==="Profile"&&<section className="view active"><div className="title-row"><div><div className="kicker">HUNTER RECORD / 06</div><h1>Profile settings.</h1><div className="subtitle">Your account and identity.</div></div></div><div className="panel"><div className="panel-head"><h2>Account</h2><span className="mono">SIGNED IN</span></div><label>EMAIL</label><div className="field">{session.user.email}</div><form onSubmit={async e=>{e.preventDefault();if(!supabase)return;const {error}=await supabase.from("profiles").update({display_name:customName.trim()}).eq("id",session.user.id);notify(error?error.message:"Display name updated.");await loadAccount();}}><label>DISPLAY NAME</label><input className="field" value={customName} maxLength={30} onChange={e=>setCustomName(e.target.value)} placeholder="Hunter name"/><button className="button">SAVE PROFILE</button></form><button className="button secondary" style={{marginLeft:8}} onClick={signOut}>SIGN OUT</button></div><div className="notice">Keep uploaded evidence free of sensitive personal details. Evidence files are intended to be private to you and authorized administrators.</div></section>}
    </main></div>
    <div className="footer">HUNTER SYSTEM · BUILD 0.2 · ORIGINAL FAN-INSPIRED PROGRESSION UI · NOT AFFILIATED WITH SOLO LEVELING RIGHTS HOLDERS</div>
    {pendingQuest&&<div style={{position:"fixed",inset:0,background:"#02070bdc",zIndex:20,display:"grid",placeItems:"center",padding:16}}><div className="panel" style={{width:"min(540px,100%)",maxHeight:"90vh",overflow:"auto",background:"var(--surface)"}}><div className="panel-head"><h2>Submit evidence</h2><button className="mini-btn" onClick={()=>setPendingQuest(null)}>CLOSE ×</button></div><div className="kicker">{pendingQuest.is_dungeon?"SPECIAL DUNGEON":"QUEST SUBMISSION"}</div><h3 style={{margin:"8px 0"}}>{pendingQuest.title}</h3><p className="note">{pendingQuest.description}</p><div className="notice">Your file is private by default and will be reviewed by an administrator. Evidence is not proof of attention or intent; do not submit sensitive information.</div><form onSubmit={submitProof} style={{marginTop:16}}><label>UPLOAD IMAGE OR PDF · MAX 8 MB</label><input className="field" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required onChange={e=>setProofFile(e.target.files?.[0]||null)}/><label>OPTIONAL CONTEXT / SESSION NOTES</label><textarea className="field" rows={3} maxLength={1000} value={proofNote} onChange={e=>setProofNote(e.target.value)} placeholder="What did you complete? Any notes for the reviewer?"/><button className="button" disabled={busy} style={{width:"100%"}}>{busy?"UPLOADING…":"SUBMIT FOR REVIEW"}</button></form></div></div>}
  </div>;
}
