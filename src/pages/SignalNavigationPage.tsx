import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, LocateFixed, MapPin, Navigation, RefreshCw, Search, Signal, Wifi, WifiOff } from "lucide-react";
import type { ApproachDirection, Intersection, SignalPhaseState, TrafficSignal } from "@/types/traffic";
import { TRAFFIC_REGIONS, type TrafficRegionId } from "@/data/regions";
import { loadNavigationIntersections, loadNavigationSignals } from "@/services/signalNavigationDataService";

type Geo = { lat:number; lng:number; accuracy:number; heading:number|null; speed:number|null };
type NavIntersection = Intersection & { distanceMeters:number; bearing:number };
const directionLabels: Record<ApproachDirection,string> = { North:"북", NorthEast:"북동", East:"동", SouthEast:"남동", South:"남", SouthWest:"남서", West:"서", NorthWest:"북서" };
const movementLabels = { Straight:"직진", "Left Turn":"좌회전", "Right Turn":"우회전", "U Turn":"유턴", Pedestrian:"보행", Bus:"버스", Bicycle:"자전거" } as const;
const stateLabel: Record<SignalPhaseState,string> = { "protected-Movement-Allowed":"진행", "protected-clearance":"황색", "stop-And-Remain":"정지" };
const stateDot: Record<SignalPhaseState,string> = { "protected-Movement-Allowed":"bg-emerald-400", "protected-clearance":"bg-amber-300", "stop-And-Remain":"bg-red-500" };

function distanceMeters(a:{lat:number;lng:number},b:{lat:number;lng:number}){const r=6371008.8,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad,x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;return r*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
function bearing(a:{lat:number;lng:number},b:{lat:number;lng:number}){const rad=Math.PI/180,y=Math.sin((b.lng-a.lng)*rad)*Math.cos(b.lat*rad),x=Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos((b.lng-a.lng)*rad);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
function angleDiff(a:number,b:number){const d=Math.abs(a-b)%360;return Math.min(d,360-d);}
function formatDistance(m:number){return m<1000?Math.round(m)+" m":(m/1000).toFixed(1)+" km";}
function compass(deg:number|null){if(deg===null)return "-";return ["북","북동","동","남동","남","남서","서","북서"][Math.round(deg/45)%8];}
function directionForHeading(h:number):ApproachDirection{const dirs:ApproachDirection[]=["North","NorthEast","East","SouthEast","South","SouthWest","West","NorthWest"];return dirs[Math.round(h/45)%8];}
function liveSignal(signal:TrafficSignal|undefined,receivedAt:number|undefined,now:number){if(!signal)return undefined;if(signal.remainingSeconds===undefined)return signal;const elapsed=receivedAt?Math.floor((now-receivedAt)/1000):0;return {...signal,remainingSeconds:Math.max(0,signal.remainingSeconds-elapsed)};}

function TrafficLight({signal,large=false}:{signal?:TrafficSignal;large?:boolean}){
  const size=large?"h-24 w-12":"h-14 w-7";
  return <div className={size+" rounded-2xl border border-white/15 bg-black/70 p-1.5 flex flex-col justify-between items-center"}>{(["stop-And-Remain","protected-clearance","protected-Movement-Allowed"] as SignalPhaseState[]).map(function(state){const active=signal?.state===state;const activeClass=state==="protected-Movement-Allowed"?"bg-emerald-400 shadow-[0_0_26px_rgba(52,211,153,.65)]":state==="protected-clearance"?"bg-amber-300 shadow-[0_0_26px_rgba(252,211,77,.55)]":"bg-red-500 shadow-[0_0_26px_rgba(239,68,68,.55)]";return <span key={state} className={"aspect-square w-full rounded-full "+(active?activeClass:"bg-white/8")}/>})}</div>;
}

export function SignalNavigationPage(){
  const [regionId,setRegionId]=useState<TrafficRegionId>(function(){return window.localStorage.getItem("signalnow-region")==="ulsan"?"ulsan":"seoul";});
  const region=TRAFFIC_REGIONS[regionId];
  const [intersections,setIntersections]=useState<Intersection[]>([]);
  const [geo,setGeo]=useState<Geo|null>(null);
  const [locationError,setLocationError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [signals,setSignals]=useState<Map<string,TrafficSignal[]>>(new Map());
  const receivedRef=useRef<Map<string,number>>(new Map());
  const [now,setNow]=useState(Date.now());
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [query,setQuery]=useState("");

  const loadAll=useCallback(async function(){setLoading(true);try{setIntersections(await loadNavigationIntersections(regionId));setLocationError(null);}catch(error){console.error("[SignalNow navigation] intersection load failed",error);setLocationError("실시간 교차로 데이터를 불러오지 못했습니다.");}finally{setLoading(false);}},[regionId]);
  useEffect(function(){void loadAll();},[loadAll]);
  useEffect(function(){if(!navigator.geolocation){setLocationError("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");return;}const success=function(position:GeolocationPosition){const c=position.coords;setGeo({lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,heading:Number.isFinite(c.heading??NaN)?c.heading:null,speed:Number.isFinite(c.speed??NaN)&&c.speed!==null?Math.max(0,c.speed*3.6):null});setLocationError(null);};const error=function(e:GeolocationPositionError){setLocationError(e.code===1?"위치 권한이 필요합니다.":"현재 위치를 확인할 수 없습니다.");};const id=navigator.geolocation.watchPosition(success,error,{enableHighAccuracy:true,maximumAge:3000,timeout:10000});return function(){navigator.geolocation.clearWatch(id);};},[]);
  useEffect(function(){const id=window.setInterval(function(){setNow(Date.now());},1000);return function(){window.clearInterval(id);};},[]);
  const upcoming=useMemo<NavIntersection[]>(function(){if(!geo)return[];const all=intersections.map(function(item){return {...item,distanceMeters:distanceMeters(geo,item),bearing:bearing(geo,item)};});const ahead=geo.heading===null?all:all.filter(function(item){return angleDiff(geo.heading as number,item.bearing)<=115;});return [...(ahead.length?ahead:all)].sort(function(a,b){return a.distanceMeters-b.distanceMeters;}).slice(0,12);},[geo,intersections]);
  const nearest=upcoming[0];
  useEffect(function(){const targets=upcoming.slice(0,6).filter(function(item){return !signals.has(item.crsrdId);});if(!targets.length)return;let cancelled=false;void Promise.all(targets.map(async function(item){try{const data=await loadNavigationSignals(item.crsrdId,regionId);if(!cancelled){setSignals(function(previous){const next=new Map(previous);next.set(item.crsrdId,data);return next;});receivedRef.current.set(item.crsrdId,Date.now());}}catch(error){console.warn("[SignalNow navigation] signal load failed",error);}}));return function(){cancelled=true;};},[upcoming,regionId,signals]);
  const refresh=async function(){setRefreshing(true);try{setSignals(new Map());receivedRef.current.clear();await loadAll();}finally{setRefreshing(false);}};
  const filtered=useMemo(function(){const text=query.trim().toLowerCase();return text?upcoming.filter(function(item){return (item.crsrdNm+" "+item.crsrdId).toLowerCase().includes(text);}):upcoming;},[query,upcoming]);
  const currentSignals=nearest?signals.get(nearest.crsrdId):undefined;
  const primary=currentSignals?.find(function(signal){return signal.movement==="Straight"&&geo?.heading!==null&&geo?.heading!==undefined&&signal.direction===directionForHeading(geo.heading as number);})??currentSignals?.find(function(signal){return signal.movement==="Straight";})??currentSignals?.[0];
  const primaryNow=liveSignal(primary,nearest?receivedRef.current.get(nearest.crsrdId):undefined,now);
  const changeRegion=function(next:TrafficRegionId){window.localStorage.setItem("signalnow-region",next);setRegionId(next);setIntersections([]);setSignals(new Map());receivedRef.current.clear();};

  return <div className="h-svh w-full overflow-hidden bg-[#080a0d] text-white">
    <header className="absolute inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-white/10 bg-[#080a0d]/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3"><button onClick={function(){window.history.back();}} className="grid size-10 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="뒤로"><ArrowLeft className="size-5"/></button><div><div className="text-[10px] uppercase tracking-[.22em] text-emerald-300">SIGNALNOW</div><div className="font-semibold">신호 내비게이션</div></div></div>
      <div className="flex items-center gap-2"><select value={regionId} onChange={function(event){changeRegion(event.target.value as TrafficRegionId);}} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none"><option value="seoul" className="bg-[#101318]">서울</option><option value="ulsan" className="bg-[#101318]">울산</option></select><button onClick={refresh} className="grid size-10 place-items-center rounded-full bg-white/5 hover:bg-white/10" aria-label="새로고침"><RefreshCw className={"size-4 "+(refreshing?"animate-spin":"")}/></button></div>
    </header>
    <main className="h-full overflow-hidden pt-16"><div className="mx-auto grid h-full max-w-6xl grid-cols-1 md:grid-cols-[minmax(0,1fr)_330px]">
      <section className="relative overflow-hidden border-r border-white/10"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(52,211,153,.08),transparent_32%),linear-gradient(#080a0d,#0a0d11)]"/>
        <div className="relative flex h-full flex-col overflow-y-auto px-5 pb-10 pt-7 md:px-10">
          <div className="mb-6 flex items-center justify-between"><div><p className="text-xs text-white/45">현재 위치 기준 · 실제 KLID 신호 데이터</p><h1 className="mt-1 text-2xl font-bold tracking-tight">다음 신호를 미리 확인하세요</h1></div><div className="flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]"/>LIVE</div></div>
          {locationError&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100"><LocateFixed className="size-5 shrink-0"/><div>{locationError}<div className="mt-1 text-xs text-white/40">위치가 없어도 전체 교차로 데이터는 계속 표시됩니다.</div></div></div>}
          {!geo&&<div className="mb-6 rounded-3xl border border-white/10 bg-white/[.035] p-6"><div className="flex items-center gap-3"><Navigation className="size-6 text-emerald-300"/><div><div className="font-semibold">현재 위치를 기다리는 중</div><div className="text-xs text-white/45">위치 권한을 허용하면 가까운 신호부터 자동 정렬합니다.</div></div></div></div>}
          {nearest&&<div className="mb-7 rounded-[28px] border border-white/10 bg-white/[.045] p-5 shadow-2xl shadow-black/20 md:p-7">
            <div className="flex items-start justify-between gap-5"><div><div className="flex items-center gap-2 text-xs text-white/45"><MapPin className="size-3.5 text-emerald-300"/> 다음 교차로 · {formatDistance(nearest.distanceMeters)}</div><h2 className="mt-2 text-2xl font-bold md:text-3xl">{nearest.crsrdNm}</h2><div className="mt-1 text-xs text-white/40">진행 방향 {compass(geo?.heading??null)} · {formatDistance(nearest.distanceMeters)} 후</div></div><TrafficLight signal={primaryNow} large/></div>
            <div className="mt-7 grid grid-cols-[1fr_auto] items-end gap-4"><div><div className="text-xs text-white/40">{primaryNow?directionLabels[primaryNow.direction]+" · "+movementLabels[primaryNow.movement]+" · "+stateLabel[primaryNow.state]:"신호 데이터 로딩 중"}</div><div className="mt-1 flex items-baseline gap-2"><span className="text-6xl font-light tabular-nums">{primaryNow?.remainingSeconds??"—"}</span><span className="text-sm text-white/45">초</span></div></div><div className="rounded-2xl bg-black/25 px-4 py-3 text-right"><div className="text-[10px] uppercase tracking-widest text-white/30">SPEED</div><div className="mt-1 text-xl font-semibold tabular-nums">{geo?.speed===null||geo?.speed===undefined?"—":Math.round(geo.speed)} <span className="text-xs font-normal text-white/35">km/h</span></div></div></div>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/8"><div className={"h-full transition-all duration-1000 "+(primaryNow?.state==="protected-Movement-Allowed"?"w-2/3 bg-emerald-400":primaryNow?.state==="protected-clearance"?"w-1/3 bg-amber-300":"w-1/5 bg-red-500")}/></div>
          </div>}
          <div className="relative ml-3 border-l border-white/10 pl-7">
            {loading&&<div className="py-10 text-center text-sm text-white/40">실시간 교차로 데이터를 불러오는 중…</div>}
            {!loading&&filtered.map(function(item,index){const itemSignals=signals.get(item.crsrdId)??[];const straight=itemSignals.find(function(signal){return signal.movement==="Straight";});const signal=liveSignal(straight,receivedRef.current.get(item.crsrdId),now);return <button key={item.crsrdId} onClick={function(){setSelectedId(selectedId===item.crsrdId?null:item.crsrdId);}} className="group relative mb-4 block w-full text-left">
              <span className={"absolute -left-[34px] top-4 grid size-4 place-items-center rounded-full border-2 "+(index===0?"border-emerald-300 bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.7)]":"border-white/20 bg-[#080a0d]")}><span className="size-1 rounded-full bg-white/60"/></span>
              <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4 transition group-hover:border-white/15 group-hover:bg-white/[.045]"><div className="flex items-center justify-between gap-3"><div><div className="text-[11px] text-white/35">{index===0?"NEXT":"UPCOMING"} · {formatDistance(item.distanceMeters)}</div><div className="mt-1 font-semibold">{item.crsrdNm}</div><div className="mt-0.5 text-xs text-white/35">{compass(item.bearing)} 방향 · {item.crsrdId}</div></div><div className="flex items-center gap-3"><div className="text-right"><div className="text-[10px] text-white/30">직진</div><div className="text-lg font-semibold tabular-nums">{signal?.remainingSeconds??"—"}<span className="ml-1 text-[10px] text-white/30">초</span></div></div><TrafficLight signal={signal}/></div></div>
              {selectedId===item.crsrdId&&<div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/8 pt-3 sm:grid-cols-3">{itemSignals.map(function(sig,index2){return <div key={sig.direction+"-"+sig.movement+"-"+index2} className="rounded-xl bg-black/20 p-2.5"><div className="text-[10px] text-white/35">{directionLabels[sig.direction]} · {movementLabels[sig.movement]}</div><div className="mt-1 flex items-center justify-between"><span className={"size-2 rounded-full "+stateDot[sig.state]}/><span className="text-sm tabular-nums">{liveSignal(sig,receivedRef.current.get(item.crsrdId),now)?.remainingSeconds??"—"}초</span></div></div>;})}</div>}
              </div></button>;})}
            {!loading&&filtered.length===0&&<div className="py-12 text-center text-sm text-white/40">표시할 실제 교차로 데이터가 없습니다.</div>}
          </div>
        </div>
      </section>
      <aside className="hidden h-full overflow-y-auto bg-[#0b0e13] p-5 md:block">
        <div className="mb-5 rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="flex items-center gap-2 text-xs text-white/45"><Signal className="size-4 text-emerald-300"/> 데이터 상태</div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-black/20 p-3"><div className="text-[10px] text-white/30">교차로</div><div className="mt-1 text-xl font-semibold tabular-nums">{intersections.length.toLocaleString()}</div></div><div className="rounded-xl bg-black/20 p-3"><div className="text-[10px] text-white/30">신호 로드</div><div className="mt-1 text-xl font-semibold tabular-nums">{signals.size.toLocaleString()}</div></div></div></div>
        <label className="mb-5 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[.035] px-3 py-2.5"><Search className="size-4 text-white/35"/><input value={query} onChange={function(event){setQuery(event.target.value);}} placeholder="교차로 검색" className="w-full bg-transparent text-sm outline-none placeholder:text-white/25"/></label>
        <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center justify-between"><span className="text-xs text-white/45">내비 상태</span>{geo?<Wifi className="size-4 text-emerald-300"/>:<WifiOff className="size-4 text-white/25"/>}</div><div className="mt-3 space-y-2 text-xs text-white/55"><div className="flex justify-between"><span>지역</span><b className="text-white">{region.name}</b></div><div className="flex justify-between"><span>위치 정확도</span><b className="text-white">{geo?Math.round(geo.accuracy)+" m":"—"}</b></div><div className="flex justify-between"><span>방향</span><b className="text-white">{compass(geo?.heading??null)}</b></div><div className="flex justify-between"><span>속도</span><b className="text-white">{geo?.speed===null||geo?.speed===undefined?"—":Math.round(geo.speed)+" km/h"}</b></div></div></div>
        <div className="mt-5 text-[10px] leading-5 text-white/25">목업/샘플 신호값을 사용하지 않습니다. 교차로 위치와 신호 상태는 SignalNow가 연결한 실제 데이터에서 읽습니다. 위치 기반 정렬은 현재 위치와 진행 방향을 기준으로 계산합니다.</div>
      </aside>
    </div></main>
  </div>;
}
