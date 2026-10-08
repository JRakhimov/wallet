import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowLeft, ArrowRightLeft, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Coffee, CreditCard, Delete, Download, Gift, GraduationCap, HeartPulse, Home, House, List, MessageSquareText, MoreHorizontal, Plus,
  Repeat2, Settings2, Shapes, ShoppingBag, ShoppingBasket, Wallet, X, Car, Popcorn, BriefcaseBusiness, CirclePlus, Star, Plane, Utensils, PiggyBank,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DateTime } from 'luxon';
import { Account, ApiError, Category, downloadCsv, login, Operation, OperationInput, Owner, request, Summary } from './api';

const icons:Record<string,LucideIcon>={coffee:Coffee,car:Car,house:House,'shopping-basket':ShoppingBasket,'shopping-bag':ShoppingBag,
  'heart-pulse':HeartPulse,popcorn:Popcorn,repeat:Repeat2,'graduation-cap':GraduationCap,shapes:Shapes,
  'briefcase-business':BriefcaseBusiness,'circle-plus':CirclePlus,gift:Gift,plane:Plane,utensils:Utensils};
const categoryIconOptions:[string,string][]=[['shapes','Общая'],['shopping-basket','Продукты'],['coffee','Кафе'],['car','Транспорт'],['house','Дом'],['shopping-bag','Покупки'],['heart-pulse','Здоровье'],['popcorn','Развлечения'],['repeat','Подписки'],['graduation-cap','Образование'],['briefcase-business','Работа'],['circle-plus','Поступление'],['gift','Подарки'],['plane','Путешествия'],['utensils','Еда']];
const icon=(name:string)=>icons[name]||Shapes;
const money=(value:string|number,decimals=false)=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:decimals?2:0,maximumFractionDigits:2}).format(Number(value));
type SelectChoice={value:string;label:string;detail?:string;Icon?:LucideIcon};
const accountChoices=(accounts:Account[]):SelectChoice[]=>accounts.map(account=>({value:account.id,label:account.name,detail:`${money(account.balance)} сум`,Icon:account.kind==='cash'?Wallet:account.kind==='savings'?PiggyBank:CreditCard}));
const categoryChoices=(categories:Category[]):SelectChoice[]=>categories.map(category=>({value:category.id,label:category.name,Icon:icon(category.icon)}));
const accountKindChoices:SelectChoice[]=[{value:'card',label:'Карта',Icon:CreditCard},{value:'cash',label:'Наличные',Icon:Wallet},{value:'savings',label:'Сбережения',Icon:PiggyBank}];
const categoryKindChoices:SelectChoice[]=[{value:'expense',label:'Расходов',Icon:ArrowUpRight},{value:'income',label:'Доходов',Icon:ArrowDownLeft}];
const normalizeAmount=(value:string)=>value.replace(/\s/g,'').replace(',','.');
function parseCents(value:string){
  const normalized=normalizeAmount(value);
  if(!/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(normalized))return null;
  const [whole,fraction='']=normalized.split('.');
  return (whole.startsWith('-')?-1:1)*(Math.abs(Number(whole))*100+Number(fraction.padEnd(2,'0')));
}
const centsToAmount=(value:number)=>`${Math.floor(Math.abs(value)/100)}.${String(Math.abs(value)%100).padStart(2,'0')}`;
const monthLabel=(month:string)=>DateTime.fromISO(month+'-01').setLocale('ru').toFormat('LLLL yyyy');
const today=()=>DateTime.now().setZone('Asia/Tashkent').toFormat('yyyy-MM-dd');
const currentMonth=()=>today().slice(0,7);
function occurrenceForDay(day:string,zone:string){
  if(day===DateTime.now().setZone(zone).toFormat('yyyy-MM-dd'))return new Date().toISOString();
  return DateTime.fromISO(day,{zone}).set({hour:12,minute:0,second:0,millisecond:0}).toUTC().toISO()!;
}
function amountFromKeys(value:string,key:string){
  if(key==='clear')return '';
  if(key==='backspace')return value.slice(0,-1);
  if(key==='decimal')return value.includes('.')?value:(value||'0')+'.';
  if(!/^\d$/.test(key))return value;
  const parts=value.split('.');
  if(parts.length===2 && parts[1].length>=2)return value;
  if(parts.length===1 && parts[0].length>=12)return value;
  return value==='0'?key:value+key;
}
function amountLabel(value:string){const [integer,fraction]=value.split('.');return money(integer||0)+(value.includes('.')?','+(fraction||''):'');}
type Tab='home'|'history'|'reports'|'more';
type Overlay='category'|'details'|'note'|'accounts'|'categories'|'budget'|'entry'|'operation'|'trash'|'none';
const tabs:{id:Tab;label:string;Icon:LucideIcon}[]=[
  {id:'home',label:'Главная',Icon:Home},{id:'history',label:'История',Icon:List},{id:'reports',label:'Отчёты',Icon:BarChart3},{id:'more',label:'Ещё',Icon:MoreHorizontal},
];

export function App(){
  const qc=useQueryClient();
  const [auth,setAuth]=useState<'loading'|'dev'|'telegram'|'error'>('loading');
  const [authError,setAuthError]=useState('');
  const [tab,setTab]=useState<Tab>('home');
  const [overlay,setOverlay]=useState<Overlay>('none');
  const [month,setMonth]=useState(currentMonth());
  const [amount,setAmount]=useState('');
  const [categoryId,setCategoryId]=useState('');
  const [accountId,setAccountId]=useState('');
  const [note,setNote]=useState('');
  const [day,setDay]=useState(today());
  const [feedback,setFeedback]=useState('');
  const [error,setError]=useState('');
  const [detail,setDetail]=useState<Operation|null>(null);
  const [edit,setEdit]=useState(false);
  const [operationType,setOperationType]=useState<'income'|'transfer'|'adjustment'>('income');
  const [historySearch,setHistorySearch]=useState('');
  const [reportCategory,setReportCategory]=useState<string|null>(null);
  const [entryFilter,setEntryFilter]=useState<'all'|'expense'|'income'>('all');
  const [attempt,setAttempt]=useState<{key:string;body:OperationInput}|null>(null);
  const pending=useRef(false);
  const telegram=window.Telegram?.WebApp;
  async function signIn(){
    setAuth('loading');setAuthError('');
    try{const mode=await login();setAuth(mode);await qc.invalidateQueries();telegram?.ready();telegram?.expand();}
    catch(e){setAuthError(e instanceof Error?e.message:'Не удалось выполнить вход');setAuth('error');}
  }
  useEffect(()=>{void signIn();},[]);
  useEffect(()=>{
    if(!feedback)return;
    const timer=window.setTimeout(()=>setFeedback(''),3000);
    return()=>window.clearTimeout(timer);
  },[feedback]);
  const ready=auth==='dev'||auth==='telegram';
  const ownerQ=useQuery({queryKey:['owner'],queryFn:()=>request<Owner>('/me'),enabled:ready});
  const accountsQ=useQuery({queryKey:['accounts'],queryFn:()=>request<Account[]>('/accounts'),enabled:ready});
  const catsQ=useQuery({queryKey:['categories'],queryFn:()=>request<Category[]>('/categories'),enabled:ready});
  const summaryQ=useQuery({queryKey:['summary',month],queryFn:()=>request<Summary>('/reports/summary?month='+month),enabled:ready});
  const operationsQ=useQuery({queryKey:['operations',month,historySearch,entryFilter,reportCategory],queryFn:()=>{
    const p=new URLSearchParams({month});
    if(historySearch)p.set('q',historySearch);
    if(entryFilter!=='all')p.set('kind',entryFilter);
    if(reportCategory)p.set('categoryId',reportCategory);
    return request<{items:Operation[];count:number;nextCursor:string|null}>('/transactions?'+p);
  },enabled:ready});
  const trashQ=useQuery({queryKey:['trash',month],queryFn:()=>request<{items:Operation[];count:number}>('/transactions?'+new URLSearchParams({month,deleted:'true'})),enabled:ready&&overlay==='trash'});
  const [older,setOlder]=useState<Operation[]>([]);
  const [cursorLoading,setCursorLoading]=useState(false);
  useEffect(()=>setOlder([]),[month,historySearch,entryFilter,reportCategory]);
  const entries=[...(operationsQ.data?.items||[]),...older];
  const entriesByDay=entries.reduce((days,op)=>{
    const day=days.get(op.localDate)||[];
    day.push(op);days.set(op.localDate,day);
    return days;
  },new Map<string,Operation[]>());
  const activeAccounts=(accountsQ.data||[]).filter(a=>!a.archived);
  const activeCategories=(catsQ.data||[]).filter(c=>!c.archived&&c.kind==='expense').sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.position-b.position);
  const selectedCategory=activeCategories.find(c=>c.id===categoryId);
  const selectedAccount=activeAccounts.find(a=>a.id===accountId)||activeAccounts[0];
  useEffect(()=>{if(activeAccounts.length&&!activeAccounts.some(a=>a.id===accountId))setAccountId(activeAccounts[0].id);},[accountsQ.data]);
  useEffect(()=>{if(categoryId&&catsQ.data&&!activeCategories.some(c=>c.id===categoryId))setCategoryId('');},[catsQ.data]);
  useEffect(()=>{if(ownerQ.data){document.documentElement.dataset.theme=ownerQ.data.theme;document.documentElement.lang='ru';}},[ownerQ.data]);
  useEffect(()=>{
    if(overlay==='none')return;
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOverlay('none');};
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[overlay]);
  useEffect(()=>{
    if(overlay==='none')return;
    const main=document.querySelector<HTMLElement>('.main');
    const previous={html:document.documentElement.style.overflow,body:document.body.style.overflow,main:main?.style.overflowY};
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
    if(main)main.style.overflowY='hidden';
    return()=>{
      document.documentElement.style.overflow=previous.html;
      document.body.style.overflow=previous.body;
      if(main)main.style.overflowY=previous.main||'';
    };
  },[overlay!=='none']);
  useEffect(()=>{
    const back=window.Telegram?.WebApp?.BackButton;
    if(!back)return;
    if(overlay==='none'){back.hide();return;}
    const close=()=>setOverlay('none');
    back.show();back.onClick(close);
    return()=>{back.offClick(close);back.hide();};
  },[overlay]);
  useEffect(()=>{
    if(tab!=='home'||overlay!=='none')return;
    const key=(e:KeyboardEvent)=>{
      if(e.altKey||e.ctrlKey||e.metaKey||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
      const symbol=/^\d$/.test(e.key)?e.key:['.',','].includes(e.key)?'decimal':e.key==='Backspace'?'backspace':null;
      if(symbol){e.preventDefault();setAmount(v=>amountFromKeys(v,symbol));setAttempt(null);setError('');}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[tab,overlay]);
  const refresh=()=>Promise.all([qc.invalidateQueries({queryKey:['summary']}),qc.invalidateQueries({queryKey:['accounts']}),qc.invalidateQueries({queryKey:['operations']}),qc.invalidateQueries({queryKey:['trash']})]);
  const addMutation=useMutation({mutationFn:(submission:{key:string;body:OperationInput})=>request<Operation>('/transactions',{method:'POST',key:submission.key,body:JSON.stringify(submission.body)}),
    onSuccess:async(op)=>{setAmount('');setCategoryId('');setNote('');setAttempt(null);setError('');setFeedback('Записано: '+money(op.amount)+' сум');telegram?.HapticFeedback?.notificationOccurred('success');await refresh();},
    onError:(e)=>setError(e instanceof Error?e.message:'Не удалось записать расход'),
    onSettled:()=>{pending.current=false;},
  });
  function writeExpense(){
    if(!selectedAccount||!selectedCategory||!(Number(amount)>0)||pending.current)return;
    pending.current=true;setFeedback('');setError('');
    const submission=attempt||{key:crypto.randomUUID(),body:{kind:'expense' as const,amount:amount.endsWith('.')?amount.slice(0,-1):amount,accountId:selectedAccount.id,categoryId:selectedCategory.id,note,occurredAt:occurrenceForDay(day,ownerQ.data?.timezone||'Asia/Tashkent')}};
    setAttempt(submission);addMutation.mutate(submission);
  }
  function useKey(key:string){setAmount(v=>amountFromKeys(v,key));setAttempt(null);setError('');setFeedback('');telegram?.HapticFeedback?.impactOccurred('light');}
  function changeTab(next:Tab){setTab(next);if(next==='home')setMonth(currentMonth());setOverlay('none');setError('');setFeedback('');setReportCategory(null);}
  async function loadOlder(){
    if(!operationsQ.data?.nextCursor||cursorLoading)return;
    setCursorLoading(true);
    try{
      const p=new URLSearchParams({month,cursor:older.length?older[older.length-1].id:operationsQ.data.nextCursor});
      if(historySearch)p.set('q',historySearch);if(entryFilter!=='all')p.set('kind',entryFilter);if(reportCategory)p.set('categoryId',reportCategory);
      const data=await request<{items:Operation[]}>('/transactions?'+p);setOlder(v=>[...v,...data.items]);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить историю');}
    finally{setCursorLoading(false);}
  }
  const displayedDate=DateTime.fromISO(day).setLocale('ru').toFormat('d LLL');
  const isFutureMonth=month===currentMonth();
  const net=Number(summaryQ.data?.netExpense||0);
  const remaining=summaryQ.data?.remaining;
  if(auth==='loading')return <div className="center-state"><div className="loader"/><p>Открываем кошелёк…</p></div>;
  if(auth==='error')return <div className="center-state"><Wallet size={42}/><h1>Не удалось открыть кошелёк</h1><p>{authError}</p><button className="primary" onClick={()=>void signIn()}>Повторить</button></div>;
  const commonError=ownerQ.error||accountsQ.error||catsQ.error||summaryQ.error;
  if(commonError instanceof ApiError&&commonError.status===401)return <div className="center-state"><h1>Сессия истекла</h1><p>Войдите снова, чтобы продолжить.</p><button className="primary" onClick={()=>void signIn()}>Войти</button></div>;
  if(!ownerQ.data||!accountsQ.data||!catsQ.data||!summaryQ.data)return <div className="center-state"><div className="loader"/><p>{commonError instanceof Error?commonError.message:'Загружаем данные…'}</p><button className="quiet" onClick={()=>void qc.invalidateQueries()}>Обновить</button></div>;
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-icon"><Wallet size={20}/></span><span>Wallet</span></div><div className="header-right">{auth==='dev'&&<span className="dev-badge">Локально</span>}<span className="currency">UZS</span></div></header>
    {feedback&&<div className="toast" role="status">{feedback}</div>}
    <main className={'main main-'+tab}>
      {tab==='home'&&<div className="home">
        <div className="composer-head"><div><p className="eyebrow">БЫСТРАЯ ЗАПИСЬ</p><h1>Новый расход</h1></div><button className="account-chip" onClick={()=>setOverlay('details')}>{selectedAccount?.name||'Счёт'} · {displayedDate} <ChevronDown size={16}/></button></div>
        <div className="amount-wrap"><output className={'amount-display '+(amountLabel(amount).length>13?'amount-small':'')} aria-label="Сумма расхода" aria-live="polite">{amountLabel(amount)}</output><span className="unit">сум</span><button className="clear-amount" aria-label="Очистить сумму" disabled={!amount} onClick={()=>useKey('clear')}><X size={19}/></button></div>
        <button className={'category-picker '+(selectedCategory?'selected':'')} onClick={()=>setOverlay('category')}><span className="category-left">{selectedCategory?<CategoryIcon name={selectedCategory.icon}/>:<Shapes size={20}/>}<span>{selectedCategory?.name||'Выбрать категорию'}</span></span><ChevronDown size={18}/></button>
        <div className="keypad" role="group" aria-label="Цифровая клавиатура">{['1','2','3','4','5','6','7','8','9','decimal','0','backspace'].map(k=><button key={k} className={'key '+(/\D/.test(k)?'key-util':'')} onClick={()=>useKey(k)} aria-label={k==='decimal'?'Десятичная запятая':k==='backspace'?'Удалить последнюю цифру':undefined}>{k==='decimal'?',':k==='backspace'?<Delete size={23}/>:k}</button>)}</div>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <div className="expense-actions">
          <button className={'comment-expense '+(note.trim()?'has-note':'')} aria-label={note.trim()?'Изменить комментарий к расходу':'Добавить комментарий к расходу'} title={note.trim()?'Изменить комментарий':'Добавить комментарий'} disabled={addMutation.isPending} onClick={()=>setOverlay('note')}><MessageSquareText size={21}/></button>
          <button className="primary save-expense" disabled={!(Number(amount)>0&&selectedCategory&&selectedAccount)||addMutation.isPending} onClick={writeExpense}><Check size={19}/>{addMutation.isPending?'Сохраняем…':'Записать расход'}</button>
        </div>
        <button className="budget-inline" onClick={()=>{setTab('more');setOverlay('budget');}}><span>{remaining===null?`Бюджет на ${monthLabel(month)} не задан`:Number(remaining)<0?`Перерасход · ${monthLabel(month)}`:`Остаток бюджета · ${monthLabel(month)}`}</span><strong>{remaining===null?'Настроить':money(Math.abs(Number(remaining)))+' сум'}</strong></button>
      </div>}
      {tab==='history'&&<div className="page">
        <div className="page-heading"><div><p className="eyebrow">ВСЕ ОПЕРАЦИИ</p><h1>История</h1></div><button className="icon-btn" aria-label="Добавить расход" onClick={()=>changeTab('home')}><Plus size={21}/></button></div>
        <MonthSwitch month={month} setMonth={setMonth} futureDisabled={isFutureMonth}/>
        <input className="field search" placeholder="Поиск по заметке или категории" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/>
        <div className="segmented">{(['all','expense','income'] as const).map(k=><button key={k} className={entryFilter===k?'active':''} onClick={()=>setEntryFilter(k)}>{k==='all'?'Все':k==='expense'?'Расходы':'Доходы'}</button>)}</div>
        {reportCategory&&<button className="filter-pill" onClick={()=>setReportCategory(null)}>Категория · {catsQ.data.find(c=>c.id===reportCategory)?.name} <X size={14}/></button>}
        {operationsQ.error?<div className="empty">{operationsQ.error instanceof Error?operationsQ.error.message:'Не удалось загрузить историю'}<button className="quiet full" onClick={()=>void operationsQ.refetch()}>Повторить</button></div>:operationsQ.isLoading?<div className="empty">Загружаем историю…</div>:entries.length?<><div className="list">{[...entriesByDay].map(([date,items])=><div className="day-group" key={date}><div className="day-heading"><strong>{DateTime.fromISO(date).setLocale('ru').toFormat('d MMMM')}</strong>{items.some(op=>op.kind==='expense'||op.kind==='refund')&&<span>Расходы {money(items.reduce((sum,op)=>sum+(op.kind==='expense'?Number(op.amount):op.kind==='refund'?-Number(op.amount):0),0))} сум</span>}</div>{items.map(op=><OperationRow key={op.id} op={op} timezone={ownerQ.data.timezone} onClick={()=>{setDetail(op);setEdit(false);setOverlay('operation');}}/>)}</div>)}</div>{entries.length<(operationsQ.data?.count||0)&&<button className="quiet full" disabled={cursorLoading} onClick={()=>void loadOlder()}>{cursorLoading?'Загружаем…':'Показать ещё'}</button>}</>:<div className="empty">За выбранный период операций нет</div>}
      </div>}
      {tab==='reports'&&<div className="page"><div className="page-heading"><div><p className="eyebrow">АНАЛИТИКА</p><h1>Отчёты</h1></div></div><MonthSwitch month={month} setMonth={setMonth} futureDisabled={isFutureMonth}/>
        <div className="report-hero"><span>Расходы за {monthLabel(month)}</span><strong>{money(net)} <small>сум</small></strong><div className="report-sub"><span>Доходы {money(summaryQ.data.income)} сум</span><span>Возвраты {money(summaryQ.data.refunds)} сум</span></div></div>
        <h2 className="section-title">По категориям</h2>{summaryQ.data.categories.length?summaryQ.data.categories.map(c=><button key={c.id} className="category-stat" onClick={()=>{setReportCategory(c.id);setTab('history');}}><CategoryIcon name={c.icon}/><span className="category-stat-content"><span className="stat-line"><span>{c.name}</span><strong>{money(c.value)} сум</strong></span><span className="progress"><i style={{width:Math.min(100,Math.max(0,Number(c.value)/Math.max(1,net)*100))+'%'}}/></span></span></button>):<div className="empty">Добавьте первый расход, и здесь появится отчёт</div>}
        {summaryQ.data.days.length>0&&<><h2 className="section-title">По дням</h2><div className="day-chart">{summaryQ.data.days.map(d=><div key={d.date} className="day-bar"><span>{DateTime.fromISO(d.date).setLocale('ru').toFormat('d LLL')}</span><div className="progress"><i style={{width:Math.max(0,Math.min(100,Number(d.value)/Math.max(...summaryQ.data!.days.map(x=>Number(x.value)),1)*100))+'%'}}/></div><strong>{money(d.value)} сум</strong></div>)}</div></>}
      </div>}
      {tab==='more'&&<div className="page"><div className="page-heading"><div><p className="eyebrow">ВАШ КОШЕЛЁК</p><h1>Ещё</h1></div></div>
        <div className="more-group"><h2>Операции</h2><button className="menu-row" onClick={()=>{setOperationType('income');setOverlay('entry');}}><ArrowDownLeft size={20}/>Добавить доход<ChevronRight size={17}/></button><button className="menu-row" onClick={()=>{setOperationType('transfer');setOverlay('entry');}}><ArrowRightLeft size={20}/>Перевести между счетами<ChevronRight size={17}/></button><button className="menu-row" onClick={()=>{setOperationType('adjustment');setOverlay('entry');}}><Settings2 size={20}/>Сверить остаток<ChevronRight size={17}/></button></div>
        <div className="more-group"><h2>Настройки</h2><button className="menu-row" onClick={()=>setOverlay('accounts')}><CreditCard size={20}/>Счета<ChevronRight size={17}/></button><button className="menu-row" onClick={()=>setOverlay('categories')}><Shapes size={20}/>Категории<ChevronRight size={17}/></button><button className="menu-row" onClick={()=>setOverlay('budget')}><BarChart3 size={20}/>Месячный бюджет<ChevronRight size={17}/></button><button className="menu-row" onClick={()=>setOverlay('trash')}><Delete size={20}/>Недавно удалённые<ChevronRight size={17}/></button></div>
        <div className="appearance"><span>Тема</span><div className="segmented">{(['system','light','dark'] as const).map(theme=><button key={theme} className={ownerQ.data.theme===theme?'active':''} onClick={()=>void request<Owner>('/settings',{method:'PATCH',body:JSON.stringify({theme})}).then(()=>qc.invalidateQueries({queryKey:['owner']})).catch(e=>setError(e.message))}>{theme==='system'?'Система':theme==='light'?'Светлая':'Тёмная'}</button>)}</div></div>
        <button className="menu-row export-row" onClick={()=>void downloadCsv(month).catch(e=>setError(e.message))}><Download size={20}/>Экспорт операций за {monthLabel(month)}<ChevronRight size={17}/></button>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <p className="timezone">UZS · {ownerQ.data.timezone}</p>
      </div>}
    </main>
    <nav className="bottom-nav" aria-label="Основная навигация">{tabs.map(({id,label,Icon})=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>changeTab(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
    {overlay!=='none'&&<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOverlay('none');}}><section className="sheet" role="dialog" aria-modal="true" aria-label={overlay==='category'?'Выбор категории':overlay==='note'?'Комментарий к расходу':'Параметры'}><div className="sheet-head"><h2>{overlay==='category'?'Категория':overlay==='details'?'Параметры расхода':overlay==='note'?'Комментарий':overlay==='accounts'?'Счета':overlay==='categories'?'Категории':overlay==='budget'?'Бюджет':overlay==='operation'?'Операция':overlay==='trash'?'Удалённые операции':'Новая операция'}</h2><button className="icon-btn" aria-label="Закрыть" onClick={()=>setOverlay('none')}><X size={20}/></button></div>
      {overlay==='category'&&<div className="category-grid">{activeCategories.map(c=><button key={c.id} className={'category-option '+(categoryId===c.id?'selected':'')} onClick={()=>{setCategoryId(c.id);setAttempt(null);setError('');setOverlay('none');}}><CategoryIcon name={c.icon}/><span>{c.name}</span></button>)}</div>}
      {overlay==='details'&&<div className="sheet-body"><SelectField label="Счёт" value={selectedAccount?.id||''} options={accountChoices(activeAccounts)} onChange={value=>{setAccountId(value);setAttempt(null);}}/><label className="field-label">Дата<input className="field" type="date" max={today()} value={day} onChange={e=>{setDay(e.target.value);setAttempt(null);}}/></label><label className="field-label">Комментарий<input className="field" maxLength={500} value={note} placeholder="Необязательно" onChange={e=>{setNote(e.target.value);setAttempt(null);}}/></label><button className="primary full" onClick={()=>setOverlay('none')}>Готово</button></div>}
      {overlay==='note'&&<div className="sheet-body"><p className="sheet-desc">Этот комментарий сохранится вместе с расходом.</p><label className="field-label">Комментарий<textarea className="field note-field" maxLength={500} value={note} autoFocus placeholder="Например, обед с друзьями" onChange={e=>{setNote(e.target.value);setAttempt(null);}}/></label><div className="note-actions">{note&&<button className="quiet" onClick={()=>{setNote('');setAttempt(null);}}>Очистить</button>}<button className="primary" onClick={()=>setOverlay('none')}>Готово</button></div></div>}
      {overlay==='accounts'&&<AccountsPanel accounts={accountsQ.data} refresh={refresh}/>}
      {overlay==='categories'&&<CategoriesPanel categories={catsQ.data} onRefresh={()=>qc.invalidateQueries({queryKey:['categories']})}/>}
      {overlay==='budget'&&<BudgetPanel month={month} amount={summaryQ.data.budget} refresh={refresh}/>}
      {overlay==='entry'&&<EntryPanel type={operationType} accounts={activeAccounts} categories={catsQ.data} timezone={ownerQ.data.timezone} onDone={async()=>{setOverlay('none');await refresh();}}/>}
      {overlay==='trash'&&<div className="sheet-body">{trashQ.isLoading?<p className="sheet-desc">Загружаем…</p>:trashQ.data?.items.length?trashQ.data.items.map(op=><OperationRow key={op.id} op={op} timezone={ownerQ.data.timezone} onClick={()=>{setDetail(op);setEdit(false);setOverlay('operation');}}/>):<p className="sheet-desc">Удалённых операций за этот месяц нет.</p>}</div>}
      {overlay==='operation'&&detail&&<OperationPanel operation={detail} edit={edit} setEdit={setEdit} accounts={activeAccounts} categories={catsQ.data} timezone={ownerQ.data.timezone} onDone={async()=>{setOverlay('none');await refresh();}} onRefresh={refresh}/>}
    </section></div>}
  </div>;
}
function CategoryIcon({name}:{name:string}){const Icon=icon(name);return <span className="cat-icon"><Icon size={20}/></span>;}
function SelectField({label,value,options,onChange,disabled=false}:{label:string;value:string;options:SelectChoice[];onChange:(value:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const optionsId=useId();
  const labelId=useId();
  const valueId=useId();
  const selected=options.find(option=>option.value===value);
  useEffect(()=>{
    if(!open)return;
    const closeOutside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',closeOutside);
    return()=>document.removeEventListener('pointerdown',closeOutside);
  },[open]);
  function focusOption(index:number){requestAnimationFrame(()=>optionRefs.current[index]?.focus());}
  function onKeyDown(event:React.KeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return;}
    if(event.key==='Tab'&&open){setOpen(false);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!options.length)return;
    event.preventDefault();
    if(!open)setOpen(true);
    const focused=optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const current=focused>=0?focused:Math.max(0,options.findIndex(option=>option.value===value));
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?Math.min(options.length-1,current+(open?1:0)):Math.max(0,current-(open?1:0));
    focusOption(next);
  }
  return <div ref={root} className="custom-select" onKeyDown={onKeyDown}>
    <span className="field-label" id={labelId}>{label}</span>
    <button ref={trigger} type="button" className="field custom-select-trigger" aria-labelledby={`${labelId} ${valueId}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={optionsId} disabled={disabled||!options.length} onClick={()=>setOpen(v=>!v)}>
      {selected?.Icon&&<span className="select-icon"><selected.Icon size={19}/></span>}
      <span className="select-value"><span id={valueId}>{selected?.label||'Выбрать'}</span>{selected?.detail&&<small>{selected.detail}</small>}</span>
      <ChevronDown className={open?'chevron-open':''} size={18} aria-hidden="true"/>
    </button>
    {open&&<div className="custom-select-options" id={optionsId} role="listbox" aria-labelledby={labelId}>
      {options.map((option,index)=><button ref={element=>{optionRefs.current[index]=element;}} type="button" role="option" tabIndex={-1} aria-selected={value===option.value} key={option.value} className={'custom-select-option '+(value===option.value?'selected':'')} onClick={()=>{onChange(option.value);setOpen(false);trigger.current?.focus();}}>
        {option.Icon&&<span className="select-icon"><option.Icon size={19}/></span>}
        <span className="select-value"><span>{option.label}</span>{option.detail&&<small>{option.detail}</small>}</span>
        {value===option.value&&<Check size={17} aria-hidden="true"/>}
      </button>)}
    </div>}
  </div>;
}
function IconSelect({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false);
  const optionsId=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const selected=categoryIconOptions.find(([name])=>name===value)?.[1]||'Общая';
  return <div className="icon-select" onKeyDown={event=>{
    if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);trigger.current?.focus();}
  }}>
    <span className="field-label">Иконка</span>
    <button ref={trigger} type="button" className="field icon-select-trigger" aria-expanded={open} aria-controls={optionsId} disabled={disabled} onClick={()=>setOpen(v=>!v)}>
      <CategoryIcon name={value}/><span>{selected}</span><ChevronDown className={open?'chevron-open':''} size={18}/>
    </button>
    {open&&<div className="icon-options" id={optionsId} role="group" aria-label="Выбор иконки">
      {categoryIconOptions.map(([name,label])=><button type="button" key={name} className={'icon-option '+(name===value?'selected':'')} aria-pressed={name===value} onClick={()=>{onChange(name);setOpen(false);trigger.current?.focus();}}>
        <CategoryIcon name={name}/><span>{label}</span>{name===value&&<Check size={15} aria-hidden="true"/>}
      </button>)}
    </div>}
  </div>;
}
function MonthSwitch({month,setMonth,futureDisabled}:{month:string;setMonth:(s:string)=>void;futureDisabled:boolean}){
  const previous=DateTime.fromISO(month+'-01').minus({months:1}).toFormat('yyyy-MM');
  const next=DateTime.fromISO(month+'-01').plus({months:1}).toFormat('yyyy-MM');
  return <div className="month-switch"><button aria-label="Предыдущий месяц" onClick={()=>setMonth(previous)}><ChevronLeft size={18}/></button><strong>{monthLabel(month)}</strong><button aria-label="Следующий месяц" disabled={futureDisabled} onClick={()=>setMonth(next)}><ChevronRight size={18}/></button></div>;
}
function OperationRow({op,timezone,onClick}:{op:Operation;timezone:string;onClick:()=>void}){
  const Icon=op.kind==='income'||op.kind==='refund'||op.kind==='opening'?ArrowDownLeft:op.kind==='transfer'?ArrowRightLeft:op.kind==='adjustment'?Settings2:ArrowUpRight;
  const sign=op.kind==='transfer'?'':op.kind==='income'||op.kind==='refund'?'+':op.kind==='expense'?'−':op.entries[0]?.amount.startsWith('-')?'−':'+';
  const title=op.kind==='refund'?`Возврат · ${op.category?.name||'покупка'}`:op.category?.name||({transfer:'Перевод',adjustment:'Корректировка',opening:'Начальный остаток'} as Record<string,string>)[op.kind]||'Операция';
  return <button className="operation-row" onClick={onClick}><span className="operation-icon"><Icon size={20}/></span><span className="operation-text"><strong>{title}</strong><small>{op.note||DateTime.fromISO(op.occurredAt).setZone(timezone).setLocale('ru').toFormat('d LLL · HH:mm')}</small></span><span className={'operation-amount '+(sign==='+'?'positive':'')}>{sign}{money(op.amount)} <small>сум</small></span></button>;
}
function AccountsPanel({accounts,refresh}:{accounts:Account[];refresh:()=>Promise<unknown>}){
  const [name,setName]=useState('');
  const [kind,setKind]=useState('card');
  const [openingBalance,setOpeningBalance]=useState('0');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [editName,setEditName]=useState('');
  async function create(){
    setBusy(true);setError('');
    try{
      await request('/accounts',{method:'POST',body:JSON.stringify({name,kind,openingBalance})});
      setName('');setOpeningBalance('0');await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Не удалось создать счёт');}
    finally{setBusy(false);}
  }
  async function archive(account:Account){
    setBusy(true);setError('');
    try{await request('/accounts/'+account.id,{method:'PATCH',body:JSON.stringify({archived:!account.archived})});await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось изменить счёт');}
    finally{setBusy(false);}
  }
  async function rename(){
    if(!editing)return;
    setBusy(true);setError('');
    try{await request('/accounts/'+editing,{method:'PATCH',body:JSON.stringify({name:editName})});setEditing(null);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось переименовать счёт');}
    finally{setBusy(false);}
  }
  return <div className="sheet-body">
    <div className="sheet-list">{accounts.map(a=><div className="manage-row" key={a.id}><span className="manage-icon"><CreditCard size={19}/></span><span className="manage-text"><strong>{a.name}</strong><small>{a.archived?'В архиве':money(a.balance)+' сум'}</small></span><button className="text-button" disabled={busy} onClick={()=>{setEditing(a.id);setEditName(a.name);}}>Имя</button><button className="text-button" disabled={busy} onClick={()=>void archive(a)}>{a.archived?'Вернуть':'Архив'}</button></div>)}</div>
    {editing&&<div className="inline-edit"><label className="field-label">Название счёта<input className="field" maxLength={50} value={editName} onChange={e=>setEditName(e.target.value)}/></label><button className="secondary full" disabled={busy||!editName.trim()} onClick={()=>void rename()}>Сохранить название</button></div>}
    <h3 className="sheet-subtitle">Новый счёт</h3>
    <label className="field-label">Название<input className="field" maxLength={50} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, наличные"/></label>
    <SelectField label="Тип" value={kind} options={accountKindChoices} onChange={setKind}/>
    <label className="field-label">Начальный остаток, сум<input className="field" inputMode="decimal" value={openingBalance} onChange={e=>setOpeningBalance(e.target.value.replace(',','.'))}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="primary full" disabled={!name.trim()||busy} onClick={()=>void create()}>{busy?'Сохраняем…':'Создать счёт'}</button>
  </div>;
}
function CategoriesPanel({categories,onRefresh}:{categories:Category[];onRefresh:()=>Promise<unknown>}){
  const [name,setName]=useState('');
  const [kind,setKind]=useState<'expense'|'income'>('expense');
  const [iconName,setIconName]=useState('shapes');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [editName,setEditName]=useState('');
  const [editIcon,setEditIcon]=useState('shapes');
  async function create(){
    setBusy(true);setError('');
    try{await request('/categories',{method:'POST',body:JSON.stringify({name,kind,icon:iconName})});setName('');await onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось создать категорию');}
    finally{setBusy(false);}
  }
  async function archive(c:Category){
    setBusy(true);setError('');
    try{await request('/categories/'+c.id,{method:'PATCH',body:JSON.stringify({archived:!c.archived})});await onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось изменить категорию');}
    finally{setBusy(false);}
  }
  async function update(c:Category,patch:{favorite?:boolean;name?:string;icon?:string}){
    setBusy(true);setError('');
    try{await request('/categories/'+c.id,{method:'PATCH',body:JSON.stringify(patch)});setEditing(null);await onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось изменить категорию');}
    finally{setBusy(false);}
  }
  return <div className="sheet-body">
    <div className="sheet-list">{categories.map(c=><div className="manage-row" key={c.id}><CategoryIcon name={c.icon}/><span className="manage-text"><strong>{c.name}</strong><small>{c.archived?'В архиве':c.kind==='expense'?'Расход':'Доход'}</small></span><button className="star-button" aria-label={c.favorite?'Убрать из избранного':'В избранное'} disabled={busy} onClick={()=>void update(c,{favorite:!c.favorite})}><Star size={17} fill={c.favorite?'currentColor':'none'}/></button><button className="text-button" disabled={busy} onClick={()=>{setEditing(c.id);setEditName(c.name);setEditIcon(c.icon);}}>Править</button><button className="text-button" disabled={busy} onClick={()=>void archive(c)}>{c.archived?'Вернуть':'Архив'}</button></div>)}</div>
    {editing&&<div className="inline-edit"><label className="field-label">Название категории<input className="field" maxLength={50} value={editName} onChange={e=>setEditName(e.target.value)}/></label><IconSelect value={editIcon} onChange={setEditIcon} disabled={busy}/><button className="secondary full" disabled={busy||!editName.trim()} onClick={()=>void update(categories.find(c=>c.id===editing)!,{name:editName,icon:editIcon})}>Сохранить изменения</button></div>}
    <h3 className="sheet-subtitle">Новая категория</h3>
    <label className="field-label">Название<input className="field" maxLength={50} value={name} onChange={e=>setName(e.target.value)} placeholder="Например, спорт"/></label>
    <SelectField label="Для" value={kind} options={categoryKindChoices} onChange={value=>setKind(value as 'expense'|'income')}/>
    <IconSelect value={iconName} onChange={setIconName} disabled={busy}/>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="primary full" disabled={!name.trim()||busy} onClick={()=>void create()}>{busy?'Сохраняем…':'Создать категорию'}</button>
  </div>;
}
function BudgetPanel({month,amount,refresh}:{month:string;amount:string|null;refresh:()=>Promise<unknown>}){
  const [value,setValue]=useState(amount||'');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>setValue(amount||''),[month,amount]);
  async function save(){
    setBusy(true);setError('');
    try{await request('/budgets/'+month,{method:'PUT',body:JSON.stringify({amount:normalizeAmount(value)})});await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить бюджет');}
    finally{setBusy(false);}
  }
  return <div className="sheet-body"><p className="sheet-desc">Общий лимит на {monthLabel(month)}.</p><label className="field-label">Лимит, сум<input className="field" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="Например, 6 000 000"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={!value.trim()||busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить бюджет'}</button></div>;
}
function EntryPanel({type,accounts,categories,timezone,onDone}:{type:'income'|'transfer'|'adjustment';accounts:Account[];categories:Category[];timezone:string;onDone:()=>Promise<void>}){
  const [amount,setAmount]=useState('');
  const [source,setSource]=useState(accounts[0]?.id||'');
  const [target,setTarget]=useState(accounts[1]?.id||'');
  const [category,setCategory]=useState(categories.find(c=>c.kind==='income'&&!c.archived)?.id||'');
  const [date,setDate]=useState(today());
  const [note,setNote]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const attempt=useRef<{key:string;body:OperationInput}|null>(null);
  const reset=()=>{attempt.current=null;setError('');};
  const currentCents=parseCents(accounts.find(a=>a.id===source)?.balance||'0')||0;
  const enteredCents=parseCents(amount);
  const difference=enteredCents===null?null:enteredCents-currentCents;
  const canSave=type==='adjustment'?difference!==null&&difference!==0&&Math.abs(difference)<100_000_000_000_000:enteredCents!==null&&enteredCents>0;
  async function save(){
    setBusy(true);setError('');
    const body:OperationInput={kind:type,amount:type==='adjustment'?centsToAmount(difference||0):normalizeAmount(amount),accountId:source,note,occurredAt:occurrenceForDay(date,timezone)};
    if(type==='transfer')body.targetAccountId=target;
    if(type==='income')body.categoryId=category;
    if(type==='adjustment')body.direction=(difference||0)>0?'in':'out';
    const submission=attempt.current||{key:crypto.randomUUID(),body};attempt.current=submission;
    try{await request('/transactions',{method:'POST',key:submission.key,body:JSON.stringify(submission.body)});await onDone();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить операцию');}
    finally{setBusy(false);}
  }
  const activeIncome=categories.filter(c=>c.kind==='income'&&!c.archived);
  return <div className="sheet-body">
    <SelectField label={type==='transfer'?'Со счёта':'Счёт'} value={source} options={accountChoices(accounts)} onChange={value=>{setSource(value);reset();}}/>
    {type==='adjustment'&&<p className="sheet-desc">По учёту сейчас {money(currentCents/100)} сум. Введите фактический остаток, разница запишется отдельной операцией.</p>}
    <label className="field-label">{type==='adjustment'?'Фактический остаток, сум':'Сумма, сум'}<input className="field" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);reset();}} placeholder="0"/></label>
    {type==='adjustment'&&difference!==null&&difference!==0&&<p className="sheet-desc">Корректировка: {difference>0?'+':'−'}{money(Math.abs(difference)/100)} сум</p>}
    {type==='transfer'&&<SelectField label="На счёт" value={target} options={accountChoices(accounts)} onChange={value=>{setTarget(value);reset();}}/>}
    {type==='income'&&<SelectField label="Категория" value={category} options={categoryChoices(activeIncome)} onChange={value=>{setCategory(value);reset();}}/>}
    <label className="field-label">Дата<input className="field" type="date" max={today()} value={date} onChange={e=>{setDate(e.target.value);reset();}}/></label>
    <label className="field-label">Заметка<input className="field" maxLength={500} value={note} onChange={e=>{setNote(e.target.value);reset();}} placeholder="Необязательно"/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="primary full" disabled={busy||!canSave||(type==='transfer'&&(!target||target===source))} onClick={()=>void save()}>{busy?'Сохраняем…':type==='income'?'Записать доход':type==='transfer'?'Перевести':'Сохранить корректировку'}</button>
  </div>;
}
function OperationPanel({operation,edit,setEdit,accounts,categories,timezone,onDone,onRefresh}:{operation:Operation;edit:boolean;setEdit:(v:boolean)=>void;accounts:Account[];categories:Category[];timezone:string;onDone:()=>Promise<void>;onRefresh:()=>Promise<unknown>}){
  const [op,setOp]=useState(operation);
  const [amount,setAmount]=useState(operation.amount);
  const [account,setAccount]=useState((operation.kind==='transfer'?operation.entries.find(e=>e.amount.startsWith('-')):operation.entries[0])?.accountId||'');
  const [target,setTarget]=useState(operation.entries.find(e=>!e.amount.startsWith('-'))?.accountId||'');
  const [category,setCategory]=useState(operation.category?.id||'');
  const [note,setNote]=useState(operation.note);
  const [date,setDate]=useState(operation.localDate);
  const [refundAmount,setRefundAmount]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const repeatAttempt=useRef<{key:string;body:OperationInput}|null>(null);
  const refundAttempt=useRef<{key:string;body:OperationInput}|null>(null);
  const editable=['expense','income','transfer','adjustment','refund'].includes(op.kind);
  const maxRefund=Number(op.amount)-Number(op.refunded);
  async function send(method:string,path:string,body:unknown,key?:string){
    setBusy(true);setError('');
    try{const updated=await request<Operation>(path,{method,key,body:JSON.stringify(body)});setOp(updated);setEdit(false);await onDone();}
    catch(e){setError(e instanceof Error?e.message:'Не удалось изменить операцию');}
    finally{setBusy(false);}
  }
  function saveEdit(){
    const input:OperationInput={kind:op.kind as OperationInput['kind'],amount:amount.replace(',','.'),accountId:account,note,occurredAt:occurrenceForDay(date,timezone)};
    if(op.kind==='expense'||op.kind==='income')input.categoryId=category;
    if(op.kind==='transfer')input.targetAccountId=target;
    if(op.kind==='adjustment')input.direction=op.entries[0]?.amount.startsWith('-')?'out':'in';
    if(op.kind==='refund')input.parentId=op.parentId||undefined;
    void send('PATCH','/transactions/'+op.id,{...input,version:op.version});
  }
  function repeatOperation(){
    const input:OperationInput={kind:op.kind as OperationInput['kind'],amount:op.amount,accountId:(op.kind==='transfer'?op.entries.find(e=>e.amount.startsWith('-')):op.entries[0])?.accountId||'',note:op.note,occurredAt:new Date().toISOString()};
    if(op.kind==='expense'||op.kind==='income')input.categoryId=op.category?.id;
    if(op.kind==='transfer')input.targetAccountId=op.entries.find(e=>!e.amount.startsWith('-'))?.accountId;
    const attempt=repeatAttempt.current||{key:crypto.randomUUID(),body:input};
    repeatAttempt.current=attempt;
    void send('POST','/transactions',attempt.body,attempt.key);
  }
  function refundOperation(){
    const input:OperationInput={kind:'refund',amount:refundAmount.replace(',','.'),accountId:op.entries[0]?.accountId,parentId:op.id,note:'Возврат',occurredAt:new Date().toISOString()};
    const attempt=refundAttempt.current||{key:crypto.randomUUID(),body:input};
    refundAttempt.current=attempt;
    void send('POST','/transactions',attempt.body,attempt.key);
  }
  async function toggleDeleted(){
    setBusy(true);setError('');
    try{
      const updated=await request<Operation>('/transactions/'+op.id+(op.deleted?'/restore':''),{method:op.deleted?'POST':'DELETE',body:JSON.stringify({version:op.version})});
      setOp(updated);await onRefresh();
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить операцию');}
    finally{setBusy(false);}
  }
  return <div className="sheet-body">
    <div className="operation-detail"><span>{op.kind==='refund'?`Возврат · ${op.category?.name||'покупка'}`:op.category?.name||op.kind}</span><strong>{money(op.amount)} сум</strong><small>{DateTime.fromISO(op.occurredAt).setZone(timezone).setLocale('ru').toFormat('d MMMM yyyy · HH:mm')}</small><small>{(op.kind==='transfer'?[...op.entries].sort((a,b)=>Number(b.amount.startsWith('-'))-Number(a.amount.startsWith('-'))):op.entries).map(e=>e.accountName).join(' → ')}</small>{op.note&&<p>{op.note}</p>}</div>
    {edit&&<div className="edit-form"><label className="field-label">Сумма<input className="field" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><SelectField label="Счёт" value={account} options={accountChoices(accounts)} onChange={setAccount}/>
      {op.kind==='transfer'&&<SelectField label="На счёт" value={target} options={accountChoices(accounts)} onChange={setTarget}/>}
      {['expense','income'].includes(op.kind)&&<SelectField label="Категория" value={category} options={categoryChoices(categories.filter(c=>!c.archived&&c.kind===op.kind))} onChange={setCategory}/>}
      <label className="field-label">Дата<input className="field" type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><label className="field-label">Заметка<input className="field" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <button className="primary full" disabled={busy||!(Number(amount.replace(',','.'))>0)} onClick={saveEdit}>Сохранить изменения</button></div>}
    {!edit&&editable&&!op.deleted&&<button className="secondary full" disabled={busy} onClick={()=>setEdit(true)}>Изменить</button>}
    {!edit&&!op.deleted&&['expense','income','transfer'].includes(op.kind)&&<button className="secondary full" disabled={busy} onClick={repeatOperation}>Повторить операцию</button>}
    {op.kind==='expense'&&!op.deleted&&maxRefund>0&&!edit&&<div className="refund-box"><label className="field-label">Возврат, не больше {money(maxRefund)} сум<input className="field" inputMode="decimal" value={refundAmount} onChange={e=>{setRefundAmount(e.target.value);refundAttempt.current=null;}} placeholder="Сумма возврата"/></label><button className="secondary full" disabled={busy||!(Number(refundAmount.replace(',','.'))>0)} onClick={refundOperation}>Записать возврат</button></div>}
    <button className="danger-link" disabled={busy} onClick={()=>void toggleDeleted()}>{op.deleted?'Восстановить операцию':'Удалить операцию'}</button>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
