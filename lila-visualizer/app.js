const MAP_IMAGES = {
  AmbroseValley: "minimaps/AmbroseValley_Minimap.jpg",
  GrandRift: "minimaps/GrandRift_Minimap.jpg",
  Lockdown: "minimaps/Lockdown_Minimap.jpg",
};

const EVENT_STYLE = {
  BotKill: { color: "#ffd25c", shape: "star", size: 7, group: "kill" },
  Kill: { color: "#ffd25c", shape: "star", size: 9, group: "kill" },
  BotKilled: { color: "#ff5668", shape: "x", size: 6, group: "death" },
  Killed: { color: "#ff5668", shape: "x", size: 8, group: "death" },
  Loot: { color: "#ff9f4a", shape: "circle", size: 3, group: "loot" },
  KilledByStorm: { color: "#c18bff", shape: "plus", size: 7, group: "storm" },
};

const state = {
  matchIndex: [], currentMatch: null, mapImage: new Image(), playing: false,
  playTimer: null, requestId: 0, actorFilter: "all", speed: 10,
  eventVisibility: { kill: true, death: true, loot: true, storm: true },
};

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const els = {
  mapSelect: document.getElementById("mapSelect"), daySelect: document.getElementById("daySelect"), matchSelect: document.getElementById("matchSelect"),
  matchTitle: document.getElementById("matchTitle"), matchBadge: document.getElementById("matchBadge"), matchMeta: document.getElementById("matchMeta"), matchStats: document.getElementById("matchStats"),
  timeSlider: document.getElementById("timeSlider"), timeLabel: document.getElementById("timeLabel"), durationLabel: document.getElementById("durationLabel"), timelineProgress: document.getElementById("timelineProgress"),
  playBtn: document.getElementById("playBtn"), mapLabel: document.getElementById("mapLabel"), playersLabel: document.getElementById("playersLabel"), eventCountLabel: document.getElementById("eventCountLabel"),
  viewerState: document.getElementById("viewerState"), eventToast: document.getElementById("eventToast"), speedSelect: document.getElementById("speedSelect"), heatmapToggle: document.getElementById("heatmapToggle"),
  errorBanner: document.getElementById("errorBanner"), errorText: document.getElementById("errorText"), datasetStatus: document.getElementById("datasetStatus"),
};

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
function formatTime(sec) { sec = Math.max(0, Math.floor(Number(sec) || 0)); const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60; return h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`; }
function showError(message) { els.errorText.textContent=message; els.errorBanner.hidden=false; els.datasetStatus.className="status-pill error"; els.datasetStatus.innerHTML='<span class="status-dot"></span> Data error'; }
function hideError(){ els.errorBanner.hidden=true; }
async function fetchJson(url){ const response=await fetch(url,{cache:"no-store"}); if(!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`); return response.json(); }
function sortDays(days){ return days.sort((a,b)=>(parseInt(a.split("_")[1],10)||0)-(parseInt(b.split("_")[1],10)||0)); }

function initControls(){
  els.mapSelect.addEventListener("change",populateDayDropdown); els.daySelect.addEventListener("change",populateMatchDropdown); els.matchSelect.addEventListener("change",()=>loadMatch(els.matchSelect.value));
  els.timeSlider.addEventListener("input",()=>{stopPlaying();render();}); els.playBtn.addEventListener("click",togglePlay);
  els.speedSelect.addEventListener("change",()=>{state.speed=Number(els.speedSelect.value)||10;if(state.playing){stopPlaying();startPlaying();}});
  els.heatmapToggle.addEventListener("change",render); document.querySelectorAll('input[name="heatmapMode"]').forEach(r=>r.addEventListener("change",render));
  document.querySelectorAll("[data-actor]").forEach(btn=>btn.addEventListener("click",()=>{state.actorFilter=btn.dataset.actor;document.querySelectorAll("[data-actor]").forEach(b=>b.classList.toggle("active",b===btn));render();}));
  document.querySelectorAll("[data-event]").forEach(input=>input.addEventListener("change",()=>{state.eventVisibility[input.dataset.event]=input.checked;render();}));
  document.getElementById("resetViewBtn").addEventListener("click",resetView); document.getElementById("fitBtn").addEventListener("click",()=>render());
  document.getElementById("fullscreenBtn").addEventListener("click",toggleFullscreen); document.getElementById("centerPlayerBtn").addEventListener("click",centerOnHuman); document.getElementById("shareBtn").addEventListener("click",copyShareLink); document.getElementById("dismissError").addEventListener("click",hideError);
  window.addEventListener("keydown",handleKeydown);
}

async function init(){
  initControls();
  try{
    els.datasetStatus.className="status-pill loading"; state.matchIndex=await fetchJson("data/match_index.json");
    if(!Array.isArray(state.matchIndex)||!state.matchIndex.length) throw new Error("match_index.json is empty or invalid");
    els.datasetStatus.className="status-pill"; els.datasetStatus.innerHTML='<span class="status-dot"></span> Dataset ready';
    const maps=[...new Set(state.matchIndex.map(m=>m.map_id))].sort(); els.mapSelect.innerHTML=maps.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join(""); populateDayDropdown();
    const params=new URLSearchParams(location.search),matchId=params.get("match");
    if(matchId&&state.matchIndex.some(m=>m.match_id===matchId)){const target=state.matchIndex.find(m=>m.match_id===matchId);els.mapSelect.value=target.map_id;populateDayDropdown(target.day);if([...els.matchSelect.options].some(o=>o.value===matchId)){els.matchSelect.value=matchId;loadMatch(matchId);}}
  }catch(error){console.error(error);showError(`Could not load the dataset. ${error.message}`);}
}
function populateDayDropdown(selectedDay=null){const selectedMap=els.mapSelect.value;const days=sortDays([...new Set(state.matchIndex.filter(m=>m.map_id===selectedMap).map(m=>m.day))]);els.daySelect.innerHTML='<option value="__all__">All dates</option>'+days.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d.replace("_"," "))}</option>`).join("");if(selectedDay&&days.includes(selectedDay))els.daySelect.value=selectedDay;populateMatchDropdown();}
function populateMatchDropdown(){const selectedMap=els.mapSelect.value,selectedDay=els.daySelect.value;const matches=state.matchIndex.filter(m=>m.map_id===selectedMap&&(selectedDay==="__all__"||m.day===selectedDay));matches.sort((a,b)=>b.duration_sec-a.duration_sec||a.match_id.localeCompare(b.match_id));els.matchSelect.innerHTML=matches.length?matches.map((m,i)=>`<option value="${escapeHtml(m.match_id)}">${escapeHtml(m.day.replace("_"," "))} · ${m.n_players}p · ${m.n_humans} human · ${formatTime(m.duration_sec)}${i===0?" · longest":""}</option>`).join(""):'<option value="">No matches</option>';if(matches.length)loadMatch(matches[0].match_id);else clearMatch();}
function clearMatch(){stopPlaying();state.currentMatch=null;els.matchTitle.textContent="No match available";els.matchBadge.textContent="—";els.matchMeta.innerHTML="";els.matchStats.innerHTML="";els.mapLabel.textContent="—";els.playersLabel.textContent="—";els.timeLabel.textContent="0:00";els.durationLabel.textContent="0:00";els.eventCountLabel.textContent="0 visible events";els.viewerState.textContent="No replay loaded";ctx.clearRect(0,0,canvas.width,canvas.height);}

async function loadMatch(matchId){
  if(!matchId)return clearMatch(); const request=++state.requestId; stopPlaying(); els.viewerState.textContent="Loading replay…";
  try{
    const safeName=String(matchId).replace(/[^a-zA-Z0-9_-]/g,"_");const raw=await fetchJson(`data/matches/${safeName}.json`);validateRawMatch(raw);if(request!==state.requestId)return;
    const players=raw.players||[];state.currentMatch={match_id:raw.match_id,map_id:raw.map_id,day:raw.day,duration_sec:Number(raw.duration_sec)||0,players,events:raw.events.map(([p,e,t,px,py])=>({player_index:p,user_id:players[p].id,is_human:players[p].h,event:raw.event_names[e],t:Number(t)||0,pixel_x:Number(px),pixel_y:Number(py)})).filter(e=>Number.isFinite(e.pixel_x)&&Number.isFinite(e.pixel_y))};
    await loadMapImage(state.currentMatch.map_id,request);if(request!==state.requestId)return;els.timeSlider.max=state.currentMatch.duration_sec;els.timeSlider.value=0;updateMatchSummary();updateUrl();render();els.viewerState.textContent="Replay ready";
  }catch(error){console.error(error);if(request!==state.requestId)return;showError(`Could not load match ${matchId}. ${error.message}`);els.viewerState.textContent="Replay unavailable";}
}
function validateRawMatch(raw){if(!raw||typeof raw!=="object")throw new Error("Invalid match JSON");if(!Array.isArray(raw.players)||!Array.isArray(raw.events)||!Array.isArray(raw.event_names))throw new Error("Match schema is incomplete");}
function loadMapImage(mapId,request){return new Promise((resolve,reject)=>{const src=MAP_IMAGES[mapId];if(!src)return reject(new Error(`No minimap configured for ${mapId}`));const image=new Image();image.onload=()=>{if(request===state.requestId)state.mapImage=image;resolve();};image.onerror=()=>reject(new Error(`Could not load minimap asset: ${src}`));image.src=src;});}
function statCard(label,value,sub){return `<div class="stat-card"><span class="label">${label}</span><strong>${value}</strong><span class="sub">${sub}</span></div>`;}
function eventCounts(events){return events.reduce((a,e)=>{if(e.event==="Loot")a.loot++;if(e.event==="Kill"||e.event==="BotKill")a.kill++;if(e.event==="Killed"||e.event==="BotKilled"||e.event==="KilledByStorm")a.death++;return a;},{loot:0,kill:0,death:0});}
function updateMatchSummary(){const m=state.currentMatch,humans=m.players.filter(p=>p.h).length,bots=m.players.length-humans,c=eventCounts(m.events);els.matchTitle.textContent=`${m.day.replace("_"," ")} session`;els.matchBadge.textContent=m.map_id;els.matchMeta.innerHTML=`<div class="meta-item"><span class="label">Match ID</span><strong title="${escapeHtml(m.match_id)}">${escapeHtml(m.match_id.slice(0,8))}…</strong></div><div class="meta-item"><span class="label">Duration</span><strong>${formatTime(m.duration_sec)}</strong></div><div class="meta-item"><span class="label">Human actors</span><strong>${humans}</strong></div><div class="meta-item"><span class="label">Bot actors</span><strong>${bots}</strong></div>`;els.matchStats.innerHTML=[statCard("Loot",c.loot,"pickups"),statCard("Kills",c.kill,"combat events"),statCard("Deaths",c.death,"fatal events"),statCard("Telemetry",m.events.length.toLocaleString(),"points/events")].join("");els.mapLabel.textContent=m.map_id;els.playersLabel.textContent=`${humans}H / ${bots}B`;els.durationLabel.textContent=formatTime(m.duration_sec);}
function actorVisible(isHuman){return state.actorFilter==="all"||(state.actorFilter==="human"&&isHuman)||(state.actorFilter==="bot"&&!isHuman);}
function eventVisible(eventName){const style=EVENT_STYLE[eventName];return !style||state.eventVisibility[style.group];}

function render(){
  const m=state.currentMatch;if(!m||!state.mapImage.complete)return;const t=Number(els.timeSlider.value);els.timeLabel.textContent=formatTime(t);const progress=m.duration_sec?Math.min(100,t/m.duration_sec*100):0;els.timelineProgress.style.width=`${progress}%`;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(state.mapImage,0,0,canvas.width,canvas.height);if(els.heatmapToggle.checked)drawHeatmap(t);
  const byUser=new Map();for(const e of m.events){if(e.t>t||!actorVisible(e.is_human))continue;if(!byUser.has(e.user_id))byUser.set(e.user_id,[]);byUser.get(e.user_id).push(e);}let visibleEvents=0;const recent=[];
  for(const [,events] of byUser){const isHuman=events[0].is_human,positions=events.filter(e=>e.event==="Position"||e.event==="BotPosition");drawPath(positions,isHuman);if(positions.length)drawActor(positions[positions.length-1],isHuman);for(const e of events){if(!EVENT_STYLE[e.event]||!eventVisible(e.event))continue;visibleEvents++;drawMarker(e.pixel_x,e.pixel_y,EVENT_STYLE[e.event]);if(e.t>=t-2&&e.t<=t)recent.push(e);}}
  els.eventCountLabel.textContent=`${visibleEvents.toLocaleString()} visible events`;updateEventToast(recent);
}
function drawPath(positions,isHuman){if(positions.length<2)return;ctx.save();ctx.beginPath();ctx.moveTo(positions[0].pixel_x,positions[0].pixel_y);for(const p of positions.slice(1))ctx.lineTo(p.pixel_x,p.pixel_y);ctx.strokeStyle=isHuman?"rgba(255,86,104,.94)":"rgba(94,226,255,.46)";ctx.lineWidth=isHuman?3:1.5;ctx.lineJoin="round";ctx.lineCap="round";ctx.stroke();ctx.restore();}
function drawActor(position,isHuman){ctx.save();ctx.beginPath();ctx.arc(position.pixel_x,position.pixel_y,isHuman?7:4,0,Math.PI*2);ctx.fillStyle=isHuman?"#ff5668":"#5ee2ff";ctx.shadowColor=isHuman?"rgba(255,86,104,.5)":"rgba(94,226,255,.4)";ctx.shadowBlur=isHuman?14:9;ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=2;ctx.strokeStyle="rgba(7,9,13,.9)";ctx.stroke();ctx.restore();}
function drawMarker(x,y,style){ctx.save();if(style.shape==="circle"){ctx.globalAlpha=.85;ctx.fillStyle=style.color;ctx.beginPath();ctx.arc(x,y,style.size,0,Math.PI*2);ctx.fill();}else if(style.shape==="x"){ctx.strokeStyle=style.color;ctx.lineWidth=2.5;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x-style.size,y-style.size);ctx.lineTo(x+style.size,y+style.size);ctx.moveTo(x+style.size,y-style.size);ctx.lineTo(x-style.size,y+style.size);ctx.stroke();}else if(style.shape==="plus"){ctx.strokeStyle=style.color;ctx.lineWidth=2.5;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x-style.size,y);ctx.lineTo(x+style.size,y);ctx.moveTo(x,y-style.size);ctx.lineTo(x,y+style.size);ctx.stroke();}else{drawStar(x,y,style.size,style.color);}ctx.restore();}
function drawStar(cx,cy,radius,color){ctx.beginPath();for(let i=0;i<10;i++){const angle=Math.PI/5*i-Math.PI/2,r=i%2===0?radius:radius/2.4,x=cx+Math.cos(angle)*r,y=cy+Math.sin(angle)*r;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
function drawHeatmap(time){const mode=document.querySelector('input[name="heatmapMode"]:checked')?.value||"deaths",m=state.currentMatch;if(!m)return;if(mode==="traffic")return drawTrafficHeatmap(time);const eventSet=mode==="kills"?new Set(["Kill","BotKill"]):new Set(["Killed","BotKilled","KilledByStorm"]),color=mode==="kills"?"255,210,92":"255,86,104";const points=m.events.filter(e=>e.t<=time&&actorVisible(e.is_human)&&eventSet.has(e.event));ctx.save();ctx.globalCompositeOperation="lighter";for(const e of points){const radius=46,gradient=ctx.createRadialGradient(e.pixel_x,e.pixel_y,0,e.pixel_x,e.pixel_y,radius);gradient.addColorStop(0,`rgba(${color},.28)`);gradient.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(e.pixel_x,e.pixel_y,radius,0,Math.PI*2);ctx.fill();}ctx.restore();}
function drawTrafficHeatmap(time){const GRID=16,cellSize=canvas.width/GRID,counts=new Array(GRID*GRID).fill(0);for(const e of state.currentMatch.events){if(e.t>time||!actorVisible(e.is_human)||(e.event!=="Position"&&e.event!=="BotPosition"))continue;const gx=Math.max(0,Math.min(GRID-1,Math.floor(e.pixel_x/canvas.width*GRID))),gy=Math.max(0,Math.min(GRID-1,Math.floor(e.pixel_y/canvas.height*GRID)));counts[gy*GRID+gx]++;}const max=Math.max(...counts,1);ctx.save();for(let gy=0;gy<GRID;gy++)for(let gx=0;gx<GRID;gx++){const count=counts[gy*GRID+gx];if(!count)continue;const intensity=Math.sqrt(count/max);ctx.fillStyle=`rgba(255,159,74,${(intensity*.48).toFixed(3)})`;ctx.fillRect(gx*cellSize,gy*cellSize,cellSize,cellSize);}ctx.restore();}
function updateEventToast(recentEvents){if(!recentEvents.length){els.eventToast.textContent="";return;}const e=recentEvents[recentEvents.length-1],names={Kill:"Human kill",BotKill:"Bot kill",Killed:"Human death",BotKilled:"Bot killed human",Loot:"Loot pickup",KilledByStorm:"Storm death"};els.eventToast.textContent=`${names[e.event]||e.event} · ${formatTime(e.t)}`;}

function startPlaying(){if(!state.currentMatch||state.playing)return;state.playing=true;els.playBtn.textContent="Ⅱ";els.viewerState.textContent="Replay running";const interval=50;state.playTimer=setInterval(()=>{const current=Number(els.timeSlider.value),step=Math.max(.25,state.speed*(interval/1000)),next=current+step;if(next>=Number(els.timeSlider.max)){els.timeSlider.value=Number(els.timeSlider.max);render();stopPlaying(true);return;}els.timeSlider.value=next;render();},interval);}
function stopPlaying(atEnd=false){state.playing=false;clearInterval(state.playTimer);state.playTimer=null;els.playBtn.textContent="▶";if(!atEnd&&state.currentMatch)els.viewerState.textContent="Replay paused";if(atEnd)els.viewerState.textContent="Replay complete";}
function togglePlay(){state.playing?stopPlaying():startPlaying();}
function resetView(){if(!state.currentMatch)return;els.timeSlider.value=0;stopPlaying();render();}
function centerOnHuman(){if(!state.currentMatch)return;const t=Number(els.timeSlider.value),human=state.currentMatch.events.filter(e=>e.t<=t&&e.is_human&&(e.event==="Position"||e.event==="BotPosition"));if(!human.length)return;const p=human[human.length-1];ctx.save();ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.arc(p.pixel_x,p.pixel_y,22,0,Math.PI*2);ctx.stroke();ctx.restore();}
function toggleFullscreen(){document.body.classList.toggle("fullscreen-mode");setTimeout(render,50);}
function updateUrl(){if(!state.currentMatch)return;const url=new URL(location.href);url.searchParams.set("match",state.currentMatch.match_id);history.replaceState({},"",url);}
async function copyShareLink(){if(!state.currentMatch)return;updateUrl();try{await navigator.clipboard.writeText(location.href);els.viewerState.textContent="Match link copied";setTimeout(()=>{if(!state.playing)els.viewerState.textContent="Replay ready";},1400);}catch{showError("Clipboard access is unavailable in this browser. Copy the URL manually.");}}
function handleKeydown(event){if(event.target.matches("select, input, button"))return;if(event.code==="Space"){event.preventDefault();togglePlay();}if(event.code==="ArrowLeft"){els.timeSlider.value=Math.max(0,Number(els.timeSlider.value)-5);render();}if(event.code==="ArrowRight"){els.timeSlider.value=Math.min(Number(els.timeSlider.max),Number(els.timeSlider.value)+5);render();}if(event.key.toLowerCase()==="f")toggleFullscreen();}
init();
