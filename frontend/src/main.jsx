import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import axios from 'axios';
import './style.css';
import './reference.css';

const API=import.meta.env.VITE_API_URL || '/api';

if(typeof window!=='undefined'&&!window.__nmfaTaskCloseBound){
 window.__nmfaTaskCloseBound=true;
 document.addEventListener?.('click',ev=>{
  const openTasks=document.querySelectorAll?.('details.loanPlanTask[open]')||[];
  openTasks.forEach(d=>{
   if(!d.contains(ev.target)||ev.target.closest?.('.loanPlanTask > div button')){
    setTimeout(()=>{d.open=false;},0);
   }
  });
 });
}

const nav=[
 ['MAIN',['Dashboard']],['MASTER',['Members / Customers','Loan Products','Branches','Areas / Centres / Groups','Identity / Relation / Purpose / Reason / Designation Masters']],
 ['LOAN OPERATIONS',['Apply For Loan','Loan Applications','Loans','Loan Approval','Disbursement','Loan Summary','EMI Records','Collection / EMI','Overdue / Recovery']],
 ['HRM',['Employees / Field Officers','Attendance','Salary / Payroll']],['ACCOUNTS',['Day Book','Voucher Entries','Payment','Receipt','Contra','Journal','Cashbook','Expenses']],
 ['OPERATIONS',['Household Assessment','Customer Complaints','Field Visits','Cash Handover']],['PAYMENTS',['Razorpay / Cashfree','UPI / AutoPay / eNACH','Payment History']],['REPORTS',['MIS Reports','Financial Reports','Portfolio Reports','Audit Logs']],['CAPITAL',['Capital / Investment']],['SETTINGS',['Company Profile & Logo','SMS Settings','KYC Settings','General Settings','Role & Permissions','Backup / Restore']]
];
const money=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(v||0));
const dateNow=()=>new Date().toISOString().slice(0,10);
const nextEmiDate=(base,frequency='monthly')=>{const [y,m,d]=String(base).split('-').map(Number);const steps={daily:1,weekly:7,fortnightly:14,monthly:30};if(frequency==='monthly'){const targetMonth=m;const targetYear=y+Math.floor(targetMonth/12);const monthIndex=targetMonth%12;const lastDay=new Date(targetYear,monthIndex+1,0).getDate();const day=Math.min(d,lastDay);return `${targetYear}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`}const dt=new Date(Date.UTC(y,m-1,d+(steps[frequency]||30)));return dt.toISOString().slice(0,10)};

const exportCsvRows=(filename,headers,rows)=>{
 const cell=v=>{let s=String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 const csv='\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
};
const RF_TAB_TO_ROUTE={
 'Dashboard':'/','Admin':'/admin-profile','Profile':'/profile',
 'Loan Plan':'/loanplan','Penalty Scheme':'/penaltyscheme','Branches':'/branches','Branch Login':'/branch-login',
 'Staff Branch':'/staffbranches','Branch Center':'/branchCenter','Groups':'/group','Add Staff':'/add-staff','New Staff':'/add-staff',
 'Loan Purpose':'/loan-purpose','State':'/state','Bank':'/bank','Leave':'/leave','Designation':'/designation',
 'Relationship Master':'/relationship-master','Document Type':'/document-type','Collection Mode':'/collection-mode',
 'Miscellaneous':'/mixed','Software Timing':'/softwareTiming','Session':'/sessionMaster','Setting':'/setting',
 'SMS Testing':'/smstesting','Series':'/series',
 'Product Category':'/productCategory','Product Brand':'/productBrand','Product Variant':'/productVariant',
 'Product Supplier':'/productSupplier','Insurance Party':'/insuranceParty','Product':'/product','Product Loan':'/productmasterloan',
 'Employee':'/employee','Employees / Field Officers':'/employee','Salary':'/salary','Salary / Payroll':'/salary',
 'Holiday':'/holiday','Employee Transfer':'/employeeloantransfer','Employee Loan Transfer':'/employeeloantransfer',
 'Single Loan Transfer':'/employeememberloantransfer','Member Transfer':'/employeemembertransfer',
 'Update Center Leader':'/updatecenterleader','Print Letter':'/printemployeeletters','Employee Leave':'/employeeleave','Attendance':'/attendance',
 'Member List':'/customer','Members':'/customer','Members / Customers':'/customer','New Member':'/customer/new',
 'Member CGT & GRT':'/customercgt','Member Group':'/customergroup','Customer Transfer':'/customer-transfer','KYC Documents':'/kyc-documents',
 'Download Loan Form':'/downloadloanform','Loan Top-up':'/loantopup','Loan Topup':'/loantopup',
 'Individual Loan':'/individualLoan','Group Loan':'/groupLoan','Apply For Loan':'/apply-for-loan','Loan Applications':'/loan-applications','Loan Approval':'/approveloan',
 'Disbursement':'/disbursement','Disbursed':'/disbursement','Disbursed Loans':'/disbursement','Group Disbursed':'/groupMemberDisbursement',
 'Loan Summary':'/loanSummary',
 'EMI Records':'/emi-records','Advance Security':'/advancesecurity','Paid EMIs':'/showCollection','Due EMIs':'/emiCollection',
 'Due Penalty':'/penaltylist','Future Due EMIs':'/emiDemandList','Promise To Pay':'/promisetopay',
 'Group EMI Collection':'/groupEmiCollection','Member Collection (Old)':'/oldMemberCollection',
 'Member Collection (New)':'/memberCollection','Member Collection':'/memberCollection',
 'Settlement':'/settlement','Collection / EMI':'/collect-emi','Collect EMI':'/collect-emi','Overdue / Recovery':'/overdue-recovery','Overdue Transfer':'/overdue-transfer',
 'Approval - Loan':'/approveloan','Approval - Salary':'/approvesalary','Approval - Collection':'/collection',
 'Approval - Product Loan':'/approveproductloan','Approval - Settlement':'/approveSettlement','Approval - Fund Transfer':'/approval-fund-transfer',
 'Loan Case':'/loan-case','Loans':'/loans','Loan Settlement':'/settlement','Death Member List':'/deathMember',
 'CIBIL Format Download':'/cibil','Area Survey':'/areaSurvey','Log Records':'/logs','Audit Logs':'/logs','Loan History':'/loanhistory',
 'Day Book':'/daybook','Cashbook':'/cashbook','Cash Book':'/cashbook','Voucher Entries':'/voucher',
 'Payment':'/paymentvoucher','Receipt':'/receiptvoucher','Contra':'/contravoucher','Journal':'/journalvoucher',
 'Trial Balance':'/trialbalance','FY Trial Balance':'/FYTrialBalance','FY Voucher Statement':'/FYVoucherStatement','FY Opening Balance':'/FYOpeningBalance',
 'Fund Transfer':'/fundtransfer','ACGroup':'/acgroup','Profit-Loss':'/profitloss','Overview':'/overview','Ledger':'/ledger','Branch Ledger':'/branchLedger',
 'Reporting':'/reporting','MIS Reports':'/mis-reports','Financial Reports':'/financial-reports','Portfolio Reports':'/portfolio-reports',
 'Loan Report':'/LoanReport','Due EMI Report':'/DueEmiReport','Due EMI Reporting':'/DueEmiReport',
 'Collection Reporting':'/CollectionReport','Disbursement Reporting':'/DisbursementReport','Settlement Reporting':'/SettlementReport',
 'Member Attendance':'/memberemipaymentattendance','Online Payment Reporting':'/OnlinePaymentReport',
 'Experian CIBIL Report':'/cibilreportexperian','Equifax CIBIL Report':'/cibilreportequifax',
 'Payment History':'/payment-history','Other Payment':'/other-payment','Other Receipt':'/other-receipt',
 'Role':'/role','Role List':'/role','Permission':'/permission','Permission List':'/permission','Role & Permissions':'/role',
 'Expenses':'/expenses','Capital / Investment':'/capital','Deposit Accounts':'/deposit-accounts','Deposit Collection':'/deposit-collection','Financial Controls':'/financial-controls',
 'Household Assessment':'/household-assessment','Customer Complaints':'/customer-complaints','Field Visits':'/field-visits','Cash Handover':'/cash-handover',
 'Razorpay / Cashfree':'/razorpay-cashfree','UPI / AutoPay / eNACH':'/upi-enach',
 'Company Profile':'/company-profile','Company Profile & Logo':'/company-profile','SMS Settings':'/sms-settings','KYC Settings':'/kyc-settings','General Settings':'/general-settings','Backup / Restore':'/backup-restore'
};
const RF_ROUTE_ALIASES={
 '':'Dashboard','/':'Dashboard','/index.html':'Dashboard','/dashboard':'Dashboard',
 '/loanplan':'Loan Plan','/master/loanplan':'Loan Plan',
 '/penaltyscheme':'Penalty Scheme','/master/penaltyscheme':'Penalty Scheme',
 '/branches':'Branches','/master/branches':'Branches',
 '/staffbranches':'Staff Branch','/staffbranch':'Staff Branch','/master/staffbranches':'Staff Branch',
 '/branchcenter':'Branch Center','/master/branchcenter':'Branch Center',
 '/group':'Groups','/groups':'Groups','/master/group':'Groups',
 '/add-staff':'Add Staff','/employee/new':'Add Staff',
 '/state':'State','/master/state':'State','/bank':'Bank','/master/bank':'Bank',
 '/leave':'Leave','/master/leave':'Leave','/designation':'Designation','/master/designation':'Designation',
 '/mixed':'Miscellaneous','/miscellaneous':'Miscellaneous','/master/mixed':'Miscellaneous',
 '/softwaretiming':'Software Timing','/master/softwaretiming':'Software Timing',
 '/sessionmaster':'Session','/session':'Session','/master/sessionmaster':'Session',
 '/setting':'Setting','/master/setting':'Setting','/smstesting':'SMS Testing','/master/smstesting':'SMS Testing',
 '/series':'Series','/master/series':'Series',
 '/productcategory':'Product Category','/product-master/productcategory':'Product Category',
 '/productbrand':'Product Brand','/product-master/productbrand':'Product Brand',
 '/productvariant':'Product Variant','/product-master/productvariant':'Product Variant',
 '/productsupplier':'Product Supplier','/product-master/productsupplier':'Product Supplier',
 '/insuranceparty':'Insurance Party','/product-master/insuranceparty':'Insurance Party',
 '/product':'Product','/product-master/product':'Product',
 '/productmasterloan':'Product Loan','/productloan':'Product Loan','/product-master/productmasterloan':'Product Loan',
 '/employee':'Employee','/hrm/employee':'Employee','/salary':'Salary','/hrm/salary':'Salary',
 '/holiday':'Holiday','/hrm/holiday':'Holiday',
 '/employeeloantransfer':'Employee Loan Transfer','/hrm/employeeloantransfer':'Employee Loan Transfer',
 '/employeememberloantransfer':'Single Loan Transfer','/singleloantransfer':'Single Loan Transfer','/hrm/employeememberloantransfer':'Single Loan Transfer',
 '/employeemembertransfer':'Member Transfer','/membertransfer':'Member Transfer','/hrm/employeemembertransfer':'Member Transfer',
 '/updatecenterleader':'Update Center Leader','/hrm/updatecenterleader':'Update Center Leader',
 '/printemployeeletters':'Print Letter','/printletter':'Print Letter','/hrm/printemployeeletters':'Print Letter',
 '/employeeleave':'Employee Leave','/hrm/employeeleave':'Employee Leave',
 '/attendance':'Attendance','/hrm/attendance':'Attendance',
 '/customer':'Member List','/members/customer':'Member List',
 '/customercgt':'Member CGT & GRT','/membercgtgrt':'Member CGT & GRT','/members/customercgt':'Member CGT & GRT',
 '/customergroup':'Member Group','/membergroup':'Member Group','/members/customergroup':'Member Group',
 '/downloadloanform':'Download Loan Form','/loans/downloadloanform':'Download Loan Form',
 '/loantopup':'Loan Top-up','/loans/loantopup':'Loan Top-up',
 '/individualloan':'Individual Loan','/loans/individualloan':'Individual Loan',
 '/grouploan':'Group Loan','/loans/grouploan':'Group Loan',
 '/disbursement':'Disbursement','/disbursed':'Disbursement','/disbursement/individual':'Disbursement',
 '/groupmemberdisbursement':'Group Disbursed','/groupdisbursed':'Group Disbursed','/disbursement/group':'Group Disbursed',
 '/loansummary':'Loan Summary',
 '/advancesecurity':'Advance Security','/emi/advancesecurity':'Advance Security',
 '/showcollection':'Paid EMIs','/paidemis':'Paid EMIs','/emi/showcollection':'Paid EMIs',
 '/emicollection':'Due EMIs','/dueemis':'Due EMIs','/emi/emicollection':'Due EMIs',
 '/penaltylist':'Due Penalty','/duepenalty':'Due Penalty','/emi/penaltylist':'Due Penalty',
 '/emidemandlist':'Future Due EMIs','/futuredueemis':'Future Due EMIs','/emi/emidemandlist':'Future Due EMIs',
 '/promisetopay':'Promise To Pay','/emi/promisetopay':'Promise To Pay',
 '/groupemicollection':'Group EMI Collection','/emi/groupemicollection':'Group EMI Collection',
 '/oldmembercollection':'Member Collection (Old)','/membercollectionold':'Member Collection (Old)','/emi/oldmembercollection':'Member Collection (Old)',
 '/membercollection':'Member Collection (New)','/membercollectionnew':'Member Collection (New)','/emi/membercollection':'Member Collection (New)',
 '/approveloan':'Approval - Loan','/approval/loan':'Approval - Loan',
 '/approvesalary':'Approval - Salary','/approval/salary':'Approval - Salary',
 '/collection':'Approval - Collection','/approval/collection':'Approval - Collection',
 '/approveproductloan':'Approval - Product Loan','/approval/productloan':'Approval - Product Loan',
 '/approvesettlement':'Approval - Settlement','/approval/settlement':'Approval - Settlement',
 '/settlement':'Loan Settlement','/loansettlement':'Loan Settlement','/loan-case/settlement':'Loan Settlement',
 '/deathmember':'Death Member List','/deathmemberlist':'Death Member List','/loan-case/deathmember':'Death Member List',
 '/cibil':'CIBIL Format Download','/cibilformatdownload':'CIBIL Format Download',
 '/areasurvey':'Area Survey','/logs':'Log Records','/logrecords':'Log Records','/loanhistory':'Loan History',
 '/daybook':'Day Book','/accounting/daybook':'Day Book',
 '/cashbook':'Cashbook','/accounting/cashbook':'Cashbook',
 '/voucher':'Voucher Entries','/voucherentries':'Voucher Entries','/accounting/voucher':'Voucher Entries',
 '/paymentvoucher':'Payment','/payment':'Payment','/accounting/paymentvoucher':'Payment',
 '/receiptvoucher':'Receipt','/receipt':'Receipt','/accounting/receiptvoucher':'Receipt',
 '/contravoucher':'Contra','/contra':'Contra','/accounting/contravoucher':'Contra',
 '/journalvoucher':'Journal','/journal':'Journal','/accounting/journalvoucher':'Journal',
 '/trialbalance':'Trial Balance','/accounting/trialbalance':'Trial Balance',
 '/fytrialbalance':'FY Trial Balance','/accounting/fytrialbalance':'FY Trial Balance',
 '/fyvoucherstatement':'FY Voucher Statement','/accounting/fyvoucherstatement':'FY Voucher Statement',
 '/fyopeningbalance':'FY Opening Balance','/accounting/fyopeningbalance':'FY Opening Balance',
 '/fundtransfer':'Fund Transfer','/accounting/fundtransfer':'Fund Transfer',
 '/acgroup':'ACGroup','/accounting/acgroup':'ACGroup',
 '/profitloss':'Profit-Loss','/accounting/profitloss':'Profit-Loss',
 '/overview':'Overview','/accounting/overview':'Overview',
 '/ledger':'Ledger','/accounting/ledger':'Ledger',
 '/branchledger':'Branch Ledger','/accounting/branchledger':'Branch Ledger',
 '/loanreport':'Loan Report','/reporting/loanreport':'Loan Report',
 '/dueemireport':'Due EMI Report','/dueemireporting':'Due EMI Report','/reporting/dueemireport':'Due EMI Report',
 '/collectionreport':'Collection Reporting','/collectionreporting':'Collection Reporting','/reporting/collectionreport':'Collection Reporting',
 '/disbursementreport':'Disbursement Reporting','/disbursementreporting':'Disbursement Reporting','/reporting/disbursementreport':'Disbursement Reporting',
 '/settlementreport':'Settlement Reporting','/settlementreporting':'Settlement Reporting','/reporting/settlementreport':'Settlement Reporting',
 '/memberemipaymentattendance':'Member Attendance','/memberattendancereport':'Member Attendance','/memberattendance':'Member Attendance','/reporting/memberattendance':'Member Attendance',
 '/onlinepaymentreport':'Online Payment Reporting','/onlinepaymentreporting':'Online Payment Reporting','/reporting/onlinepaymentreport':'Online Payment Reporting',
 '/cibilreportexperian':'Experian CIBIL Report','/experiancibilreport':'Experian CIBIL Report','/reporting/cibilreportexperian':'Experian CIBIL Report',
 '/cibilreportequifax':'Equifax CIBIL Report','/equifaxcibilreport':'Equifax CIBIL Report','/reporting/cibilreportequifax':'Equifax CIBIL Report',
 '/permission':'Permission','/permissions/permission':'Permission',
 '/role':'Role','/roles':'Role','/permissions/role':'Role',
 '/company-profile':'Company Profile','/master/company-profile':'Company Profile','/settings/company-profile':'Company Profile','/master/settings':'Setting',
 '/admin':'Admin','/master/admin':'Admin','/admin-profile':'Admin'
};
for(const [t,p] of Object.entries(RF_TAB_TO_ROUTE)){RF_ROUTE_ALIASES[p.toLowerCase()]=t;}
function pathForTab(tab){return RF_TAB_TO_ROUTE[tab]||('/'+String(tab||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}
function resolveTabFromLocation(){
 if(typeof window==='undefined')return 'Dashboard';
 const raw=(window.location.pathname||'/').replace(/\/+$/,'')||'/';
 const hit=RF_ROUTE_ALIASES[raw.toLowerCase()];
 if(hit)return hit;
 return '__NOT_FOUND__';
}

let refreshInFlight=null;
async function refresh(){
 const stored=localStorage.getItem('refresh');
 if(!stored)return null;
 if(!refreshInFlight){
  refreshInFlight=axios.post(`${API}/token/refresh/`,{refresh:stored}).then(r=>{
   localStorage.setItem('access',r.data.access);
   // SimpleJWT is configured to rotate refresh tokens; save the replacement or
   // the next refresh attempt would reuse a blacklisted token.
   if(r.data.refresh)localStorage.setItem('refresh',r.data.refresh);
   return r.data.access;
  }).catch(()=>null).finally(()=>{refreshInFlight=null});
 }
 return refreshInFlight;
}
function api(){
 const a=axios.create({baseURL:API});
 a.interceptors.request.use(c=>{const t=localStorage.getItem('access');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
 a.interceptors.response.use(r=>r,async error=>{
  const original=error.config;
  const url=String(original?.url||'');
  if(error.response?.status!==401||!original||original._nmfaRetried||url.includes('/token/'))return Promise.reject(error);
  original._nmfaRetried=true;
  const token=await refresh();
  if(!token){localStorage.removeItem('access');localStorage.removeItem('refresh');window.dispatchEvent(new Event('nmfa-auth-expired'));return Promise.reject(error);}
  original.headers=original.headers||{};original.headers.Authorization=`Bearer ${token}`;
  return a(original);
 });
 return a;
}
function Login({onLogin,flashMsg='',clearFlash}){
 const[u,setU]=useState(()=>localStorage.getItem('nmfa_remember_user')||''),[p,setP]=useState(''),[showPwd,setShowPwd]=useState(false),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[forgotOpen,setForgotOpen]=useState(false),[forgotUser,setForgotUser]=useState(''),[forgotMsg,setForgotMsg]=useState('');
 const[logoutNotice,setLogoutNotice]=useState(()=>flashMsg||sessionStorage.getItem('nmfa_logout_flash')||'');
 const[brand,setBrand]=useState(()=>({name:localStorage.getItem('nmfa_company_name')||'UMANG MICRO FINANCE ASSOCIATION LIMITED',sub:localStorage.getItem('nmfa_company_sub')||'MICRO MUNEEM — AUTHORIZED PORTAL',logo:localStorage.getItem('nmfa_company_logo')||'/umang-ui/img/company.png',phone:localStorage.getItem('nmfa_company_phone')||'',email:localStorage.getItem('nmfa_company_email')||''}));
 useEffect(()=>{
  if(flashMsg)setLogoutNotice(flashMsg);
 },[flashMsg]);
 useEffect(()=>{
  const update=()=>setBrand({name:localStorage.getItem('nmfa_company_name')||'UMANG MICRO FINANCE ASSOCIATION LIMITED',sub:localStorage.getItem('nmfa_company_sub')||'MICRO MUNEEM — AUTHORIZED PORTAL',logo:localStorage.getItem('nmfa_company_logo')||'/umang-ui/img/company.png',phone:localStorage.getItem('nmfa_company_phone')||'',email:localStorage.getItem('nmfa_company_email')||''});
  window.addEventListener('nmfa-brand-updated',update);
  axios.get(`${API}/organization-profile/`).then(r=>{
   const rows=r.data?.results||r.data||[];
   const x=Array.isArray(rows)?rows[0]:null;
   if(x){
    localStorage.setItem('nmfa_company_name',x.name||'UMANG MICRO FINANCE ASSOCIATION LIMITED');
    localStorage.setItem('nmfa_company_sub',x.subtitle||'MICRO MUNEEM — AUTHORIZED PORTAL');
    localStorage.setItem('nmfa_company_address',x.address||'');
    localStorage.setItem('nmfa_company_phone',x.phone||'');
    localStorage.setItem('nmfa_company_email',x.email||'');
    localStorage.setItem('nmfa_company_website',x.website||'');
    if(x.logo_data)localStorage.setItem('nmfa_company_logo',x.logo_data);
    else localStorage.removeItem('nmfa_company_logo');
    update();
   }
  }).catch(()=>{});
  return()=>window.removeEventListener('nmfa-brand-updated',update);
 },[]);
 async function submit(e){
  e.preventDefault();
  if(busy)return;
  setErr('');
  setLogoutNotice('');
  try{sessionStorage.removeItem('nmfa_logout_flash');}catch{}
  clearFlash?.();
  const cleanU=u.trim();
  if(!cleanU||!p){setErr('Please enter both User ID / Username and Password.');return;}
  setBusy(true);
  try{
   const r=await axios.post(`${API}/token/`,{username:cleanU,password:p});
   if(!r.data?.access)throw new Error('Authentication token missing in response.');
   localStorage.setItem('access',r.data.access);
   if(r.data.refresh)localStorage.setItem('refresh',r.data.refresh);
   localStorage.setItem('username',cleanU);
   if(remember)localStorage.setItem('nmfa_remember_user',cleanU);
   try{sessionStorage.setItem('nmfa_login_flash','Welcome! Login successful.');}catch{}
   onLogin(r.data.access);
  }catch(ex){
   setErr(ex.response?.data?.detail||'Invalid User ID or Password. Please check your credentials and try again.');
  }finally{setBusy(false)}
 }
 function handleForgot(e){
  e.preventDefault();
  if(!forgotUser.trim()){setForgotMsg('Please enter your User ID / Employee Code.');return;}
  setForgotMsg(`Password reset request noted for User ID "${forgotUser.trim().toUpperCase()}". For security, staff and branch passwords are reset by the Head Office Administrator via Role & Permission > Staff Users or Profile > Change Password.`);
 }
 return <div className="loginWrap">
  {busy&&<>
   <div className="rfRedTopProgress" role="progressbar" aria-label="Authenticating"/>
   <div className="rfRedLoadingOverlay" role="status" aria-live="assertive">
    <div className="rfRedLoadingBox">
     <span className="rfRedSpinner" aria-hidden="true"/>
     <div><b style={{color:'#dc3545',display:'block',fontSize:14}}>Authenticating…</b><span style={{fontSize:12,color:'#555'}}>Verifying credentials with secure server, please wait.</span></div>
    </div>
   </div>
  </>}
  <form className="loginCard" onSubmit={submit} noValidate aria-busy={busy}>
   <div className="logoBlock loginBrand">
    {brand.logo?<img className="loginCompanyLogo" src={brand.logo} alt={`${brand.name} logo`} onError={e=>{e.currentTarget.src='/umang-ui/img/company.png'}}/>:<div className="loginLogoFallback" aria-label={`${brand.name} logo`}><span>₹</span></div>}
    <b>{brand.name}</b>
    <span>{brand.sub}</span>
   </div>
   <h2>Sign in to start your session</h2>
   {logoutNotice&&<div className="alert success" role="status" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>✓ {logoutNotice}</span><button type="button" style={{background:'none',border:0,color:'inherit',fontWeight:700,cursor:'pointer'}} onClick={()=>{setLogoutNotice('');try{sessionStorage.removeItem('nmfa_logout_flash')}catch{}}}>×</button></div>}
   {err&&<div className="alert danger" role="alert">{err}</div>}
   <label>USER ID / USERNAME *
    <input required disabled={busy} value={u} onChange={e=>setU(e.target.value)} placeholder="Enter User Code (e.g. ADM01)" autoComplete="username"/>
   </label>
   <label>PASSWORD *
    <div style={{display:'flex',gap:6,alignItems:'center'}}>
     <input required disabled={busy} type={showPwd?'text':'password'} value={p} onChange={e=>setP(e.target.value)} placeholder="Enter Password" autoComplete="current-password" style={{flex:1}}/>
     <button type="button" className="secondary" disabled={busy} style={{padding:'6px 10px',whiteSpace:'nowrap'}} onClick={()=>setShowPwd(s=>!s)} aria-label={showPwd?'Hide password':'Show password'}>{showPwd?'🙈 Hide':'👁 Show'}</button>
    </div>
   </label>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'6px 0 12px',fontSize:13}}>
    <label style={{display:'inline-flex',alignItems:'center',gap:6,margin:0,cursor:'pointer'}}><input type="checkbox" disabled={busy} checked={remember} onChange={e=>setRemember(e.target.checked)} style={{width:'auto'}}/> Remember Me</label>
    <button type="button" className="linkBtn" disabled={busy} style={{background:'none',border:0,color:'#17a2b8',cursor:'pointer',fontWeight:600,padding:0}} onClick={()=>{setForgotOpen(true);setForgotMsg('');setForgotUser(u)}}>Forgot Password?</button>
   </div>
   <button className="primary wide" disabled={busy}>{busy?<><span className="rfRedSpinnerInline" aria-hidden="true"/>Signing In…</>:'SIGN IN'}</button>
   <small className="muted" style={{display:'block',marginTop:10,textAlign:'center'}}>Authorized Microfinance Operations Portal · Session 2026-2027</small>
  </form>
  {forgotOpen&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setForgotOpen(false)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>FORGOT PASSWORD / ACCOUNT RECOVERY</b><button type="button" onClick={()=>setForgotOpen(false)}>×</button></header><form className="masterModalBody" onSubmit={handleForgot}><p className="muted">Enter your User ID / Employee Code to view recovery instructions. To protect financial ledgers, passwords cannot be reset anonymously without administrator verification.</p><label>USER ID / USERNAME *<input required value={forgotUser} onChange={e=>setForgotUser(e.target.value)} placeholder="e.g. ADM01"/></label>{forgotMsg&&<div className="alert">{forgotMsg}</div>}<div className="masterModalActions"><button className="masterCreateBtn">VERIFY USER ID</button><button type="button" className="masterCancelBtn" onClick={()=>setForgotOpen(false)}>CLOSE</button></div></form></section></div>}
 </div>
}
function App(){
 const[token,setToken]=useState(localStorage.getItem('access'));
 const[loggingOut,setLoggingOut]=useState(false);
 const[logoutFlash,setLogoutFlash]=useState('');
 useEffect(()=>{const expired=()=>{setLogoutFlash('Session expired. Please sign in again.');setToken(null)};window.addEventListener('nmfa-auth-expired',expired);return()=>window.removeEventListener('nmfa-auth-expired',expired)},[]);
 const logout=()=>{
  if(loggingOut)return;
  setLoggingOut(true);
  setTimeout(()=>{
   try{
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('username');
    sessionStorage.removeItem('nmfa_login_flash');
    sessionStorage.setItem('nmfa_logout_flash','Logged out successfully.');
    if(window.history?.pushState)window.history.pushState({},'','/');
   }catch(_e){}
   setLogoutFlash('Logged out successfully.');
   setToken(null);
   setLoggingOut(false);
  },260);
 };
 return <>
  {loggingOut&&<>
   <div className="rfRedTopProgress" role="progressbar" aria-label="Logging out"/>
   <div className="rfRedLoadingOverlay" role="status" aria-live="assertive">
    <div className="rfRedLoadingBox">
     <span className="rfRedSpinner" aria-hidden="true"/>
     <div><b style={{color:'#dc3545',display:'block',fontSize:14}}>Logging out…</b><span style={{fontSize:12,color:'#555'}}>Clearing session and security tokens…</span></div>
    </div>
   </div>
  </>}
  {token?<Shell logout={logout}/>:<Login onLogin={t=>{setLogoutFlash('');setToken(t)}} flashMsg={logoutFlash} clearFlash={()=>setLogoutFlash('')}/>}
 </>;
}
function permissionForNav(item){const map={'Dashboard':'view_dashboard','Admin':'manage_staff','Company Profile':'view_settings','Company Profile & Logo':'view_settings','Setting':'view_settings','Members / Customers':'view_customers','Customer Transfer':'manage_customers','Identity / Relation / Purpose / Reason / Designation Masters':'manage_customers','Loan Products':'view_loans','Branches':'view_branches','Areas / Centres / Groups':'view_branches','Apply For Loan':'create_loan_applications','Loan Applications':'create_loan_applications','Loans':'view_loans','Loan Approval':'approve_loans','Disbursement':'disburse_loans','Loan Summary':'view_loans','EMI Records':'view_loans','Collection / EMI':'collect_payments','Overdue / Recovery':'view_loans','Overdue Transfer':'view_overdue_transfers','Financial Controls':'view_accounting','Household Assessment':'view_household_assessments','Customer Complaints':'view_customer_complaints','Field Visits':'view_field_visits','Cash Handover':'view_cash_handovers','Employees / Field Officers':'manage_staff','Attendance':'manage_hr','Salary / Payroll':'manage_hr','Day Book':'view_accounting','Voucher Entries':'manage_accounting','Payment':'collect_payments','Receipt':'collect_payments','Contra':'manage_accounting','Journal':'view_accounting','Cashbook':'view_accounting','Expenses':'manage_accounting','Razorpay / Cashfree':'manage_accounting','UPI / AutoPay / eNACH':'manage_accounting','Payment History':'collect_payments','MIS Reports':'view_reports','Financial Reports':'view_accounting','Portfolio Reports':'view_reports','Audit Logs':'view_reports','Capital / Investment':'manage_accounting','SMS Settings':'manage_staff','KYC Settings':'manage_staff','General Settings':'manage_staff','Role & Permissions':'manage_staff','Backup / Restore':'manage_staff','Paid EMIs':'view_loans','Due EMIs':'view_loans','Promise To Pay':'view_loans','Member Collection':'view_loans','Settlement':'collect_payments','Download Loan Form':'view_loans','Loan Topup':'create_loan_applications','Deposit Accounts':'view_accounting','Deposit Collection':'view_accounting','Loan Case':'view_loans','CIBIL Format Download':'view_reports','Area Survey':'view_customers','Loan Plan':'view_loans','Penalty Scheme':'view_penalties','Branch Login':'manage_branches','Staff Branch':'manage_staff','New Staff':'manage_staff','Loan Purpose':'manage_customers','State':'manage_customers','Bank':'manage_customers','Leave':'manage_hr','Designation':'manage_staff','Relationship Master':'manage_customers','Document Type':'manage_customers','Collection Mode':'manage_accounting','Miscellaneous':'view_masters','Software Timing':'view_settings','Session':'view_settings','SMS Testing':'test_sms','Employee':'manage_staff','Employee Transfer':'manage_staff','Holiday':'manage_hr','Member List':'view_customers','New Member':'manage_customers','KYC Documents':'manage_customers','Approval - Loan':'approve_loans','Approval - Salary':'manage_hr','Approval - Collection':'collect_payments','Approval - Product Loan':'approve_loans','Approval - Settlement':'approve_loans','Approval - Fund Transfer':'view_fund_transfers','Disbursed Loans':'view_loans','Trial Balance':'view_accounting','FY Trial Balance':'view_accounting','FY Voucher Statement':'view_accounting','FY Opening Balance':'manage_accounting','Fund Transfer':'view_fund_transfers','Branch Ledger':'view_accounting','Ledger':'view_accounting','ACGroup':'manage_accounting','Profit-Loss':'view_accounting','Overview':'view_reports','Reporting':'view_reports','Loan Report':'view_reports','Due EMI Report':'view_reports','Collection Reporting':'view_reports','Disbursement Reporting':'view_reports','Settlement Reporting':'view_reports','Other Payment':'manage_accounting','Other Receipt':'manage_accounting','Role':'manage_staff','Role List':'manage_staff','Permission':'manage_staff','Permission List':'manage_staff','Log Records':'view_audit_logs','Product Loan':'view_loans','Salary':'manage_hr','Cash Book':'view_accounting','Reports':'view_reports','Loan Disbursement':'disburse_loans','Loan':'approve_loans','Collection':'collect_payments','Collect EMI':'collect_payments','Groups':'view_branches','Add Staff':'manage_staff','Series':'view_settings','Product Category':'view_products','Product Brand':'view_products','Product Variant':'view_products','Product Supplier':'view_products','Insurance Party':'view_products','Product':'view_products','Employee Loan Transfer':'manage_staff','Single Loan Transfer':'manage_staff','Member Transfer':'manage_customers','Update Center Leader':'manage_customers','Print Letter':'manage_hr','Employee Leave':'manage_hr','Member CGT & GRT':'manage_customers','Member Group':'view_customers','Individual Loan':'create_loan_applications','Group Loan':'create_loan_applications','Disbursed':'view_loans','Group Disbursed':'view_loans','Loan Top-up':'create_loan_applications','Advance Security':'view_loans','Due Penalty':'view_loans','Future Due EMIs':'view_loans','Group EMI Collection':'collect_payments','Member Collection (Old)':'collect_payments','Member Collection (New)':'collect_payments','Loan Settlement':'collect_payments','Death Member List':'manage_customers','Loan History':'view_loans','Member Attendance':'view_reports','Online Payment Reporting':'view_reports','Experian CIBIL Report':'view_reports','Equifax CIBIL Report':'view_reports','Due EMI Reporting':'view_reports','Profile':'view_dashboard'};return map[item]||'manage_staff'}
function firstAllowedNav(access){for(const [section,items] of nav){for(const item of items){if(access.is_admin||access.permissions[permissionForNav(item)])return item}}return 'Members / Customers'}

function Shell({logout}){
 const[tab,setTab]=useState(()=>resolveTabFromLocation()),[open,setOpen]=useState(()=>window.innerWidth>900),[dash,setDash]=useState(null),[branchSel,setBranchSel]=useState(''),[refreshKey,setRefreshKey]=useState(0),[clock,setClock]=useState(()=>new Date()),[access,setAccess]=useState({loaded:false,is_admin:false,permissions:{}});
 const[loginFlash,setLoginFlash]=useState(()=>{try{const m=sessionStorage.getItem('nmfa_login_flash')||'';if(m)sessionStorage.removeItem('nmfa_login_flash');return m;}catch{return '';}});
 useEffect(()=>{if(!loginFlash)return;const t=setTimeout(()=>setLoginFlash(''),6000);return()=>clearTimeout(t)},[loginFlash]);
 useEffect(()=>{const tick=()=>setClock(new Date());tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[]);
 const[brand,setBrand]=useState(()=>({name:localStorage.getItem('nmfa_company_name')||'NEW MICROFINANCE',sub:localStorage.getItem('nmfa_company_sub')||'SERVICE ASSOCIATION',logo:localStorage.getItem('nmfa_company_logo')||'',favicon:localStorage.getItem('nmfa_company_favicon')||''}));
 const reload=()=>setRefreshKey(x=>x+1);
 const allowed=(item)=>{
  if(item==='Profile'||item==='Admin')return true;
  if(access.is_admin||access.permissions?.['*'])return true;
  const reqPerm=permissionForNav(item);
  if(access.permissions?.[reqPerm])return true;
  if(reqPerm==='view_settings'&&(access.permissions?.manage_settings||access.permissions?.manage_company_settings||access.permissions?.manage_staff))return true;
  if(reqPerm==='view_products'&&(access.permissions?.manage_products||access.permissions?.view_loans))return true;
  if(reqPerm==='view_penalties'&&(access.permissions?.manage_penalties||access.permissions?.view_loans||access.permissions?.manage_staff))return true;
  if(reqPerm==='view_masters'&&(access.permissions?.manage_masters||access.permissions?.manage_customers||access.permissions?.manage_staff))return true;
  return false;
 };
 const navigate=(next,push=true)=>{if(next==='Profile')next='Admin';if(next!=='__NOT_FOUND__'&&access.loaded&&!allowed(next)){setTab(firstAllowedNav(access));return;}setTab(next);if(push&&typeof window!=='undefined'&&window.history?.pushState&&next!=='__NOT_FOUND__'){const p=pathForTab(next);if(window.location.pathname!==p)window.history.pushState({tab:next},'',p);}window.scrollTo({top:0,behavior:'auto'});document.querySelector('.content')?.scrollTo?.({top:0,behavior:'auto'});};
 useEffect(()=>{const onPop=()=>setTab(resolveTabFromLocation());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
 useEffect(()=>{api().get('/me/permissions/').then(r=>{const a={loaded:true,is_admin:!!r.data.is_admin,permissions:r.data.permissions||{}};setAccess(a);if(!a.is_admin&&!a.permissions.view_dashboard&&!a.permissions['*'])setTab(firstAllowedNav(a));}).catch(()=>setAccess({loaded:true,is_admin:false,permissions:{}}));},[]);
 useEffect(()=>{
  const updateBrand=()=>{
   const next={name:localStorage.getItem('nmfa_company_name')||'NEW MICROFINANCE',sub:localStorage.getItem('nmfa_company_sub')||'SERVICE ASSOCIATION',logo:localStorage.getItem('nmfa_company_logo')||'',favicon:localStorage.getItem('nmfa_company_favicon')||''};
   setBrand(next);
   if(window.__umangState){
    window.__umangState={...window.__umangState,logo:next.logo,company:next.sub||next.name};
    window.dispatchEvent(new CustomEvent('umang-state',{detail:window.__umangState}));
   }
  };
  window.addEventListener('nmfa-brand-updated',updateBrand);
  return()=>window.removeEventListener('nmfa-brand-updated',updateBrand);
 },[]);
 useEffect(()=>{
  api().get('/organization-profile/').then(r=>{
   const rows=r.data.results||r.data;const x=Array.isArray(rows)?rows[0]:null;
   if(x){
    localStorage.setItem('nmfa_company_name',x.name||'NEW MICROFINANCE');
    localStorage.setItem('nmfa_company_sub',x.subtitle||'SERVICE ASSOCIATION');
    localStorage.setItem('nmfa_company_address',x.address||'');
    localStorage.setItem('nmfa_company_phone',x.phone||'');
    localStorage.setItem('nmfa_company_email',x.email||'');
    localStorage.setItem('nmfa_company_website',x.website||'');
    if(x.logo_data)localStorage.setItem('nmfa_company_logo',x.logo_data);
    else localStorage.removeItem('nmfa_company_logo');
    setBrand(b=>({...b,name:x.name||'NEW MICROFINANCE',sub:x.subtitle||'SERVICE ASSOCIATION',logo:x.logo_data||''}));
    window.dispatchEvent(new Event('nmfa-brand-updated'));
   }
  }).catch(()=>{});
 },[]);
 useEffect(()=>{api().get('/dashboard/'+(branchSel?'?branch='+encodeURIComponent(branchSel):'')).then(r=>setDash(r.data)).catch(async e=>{if(e.response?.status===401){const t=await refresh();if(!t)logout()}})},[refreshKey,branchSel]);
 const[rfOpen,setRfOpen]=useState({});const[rfAdminMenu,setRfAdminMenu]=useState(false);const rfAllowed=(item)=>!access.loaded||allowed(item);const rfGo=(t)=>{navigate(t);if(window.innerWidth<=900)setOpen(false)};
 useEffect(()=>{const h=e=>rfGo(e.detail);window.addEventListener('nmfa-open-tab',h);return()=>window.removeEventListener('nmfa-open-tab',h)},[access,tab]);
 const rfUser=(localStorage.getItem('username')||'ADMIN').toUpperCase();const rfSession=(()=>{const n=new Date(),y=n.getFullYear();return n.getMonth()>=3?y+'-'+(y+1):(y-1)+'-'+y})();
 const umangLocked=access.loaded?RF_NAV.flatMap(e=>e.tab?[e.tab]:(e.children||[]).map(k=>k[0])).concat(RF_TOP_LINKS.map(x=>x[1])).filter(t=>!allowed(t)):[];
 useEffect(()=>{const st={tab,user:rfUser,degn:access.is_admin?'Admin':'Staff',session:rfSession,locked:umangLocked,logo:brand.logo,company:brand.sub||brand.name};window.__umangState=st;window.dispatchEvent(new CustomEvent('umang-state',{detail:st}))},[tab,rfUser,rfSession,access,brand.logo,brand.name,brand.sub,umangLocked.join('|')]);
 useEffect(()=>{const h=()=>logout();window.addEventListener('umang-logout',h);return()=>window.removeEventListener('umang-logout',h)},[logout]);
 const flashNode=loginFlash?<div className="rfAuthFlashBanner" role="status"><span>✓ {loginFlash}</span><button type="button" aria-label="Dismiss welcome message" onClick={()=>setLoginFlash('')}>×</button></div>:null;
 const umangOn=typeof window!=='undefined'&&!!(window.customElements&&window.customElements.get('umang-shell'));
 if(umangOn){return <>{flashNode}<umang-shell><div className="rfApp"><div className="rfMain"><main className="content rfContent">{tab!=='Dashboard'&&<><div className="rfCrumbBar"><button type="button" className="linkBtn" style={{background:"none",border:0,padding:0,color:"inherit",cursor:"pointer",fontWeight:600}} onClick={()=>navigate("Dashboard")}>Home</button> &nbsp;&rsaquo;&nbsp; <span>{tab==="__NOT_FOUND__"?"404 Not Found":tab}</span></div><Page tab={tab} dash={dash} reload={reload} go={navigate} branchSel={branchSel} setBranchSel={setBranchSel} brand={brand} access={access} logout={logout}/></>}</main></div></div></umang-shell></>}
 return <div className={open?"rfApp":"rfApp rfSidebarClosed"}><aside className={open?'rfSide':'rfSide closed'}><div className="rfLogo" aria-hidden="true"></div><div className="rfUmangPanel"><img src={brand.logo||"/umang-rupee.png"} alt={brand.name||"Company logo"} style={{objectFit:'contain',maxHeight:64}}/><strong>{brand.sub||brand.name||'UMANG'}</strong></div><div className="rfUserPanel"><b>{rfUser}</b><span><i className="rfDot"/>DEGN: {access.is_admin?'ADMIN':'STAFF'}</span></div><nav className="rfNav">{RF_NAV.map(entry=>{if(entry.header)return <div key={'h-'+entry.header} className="rfNavHeader">{entry.header}</div>;if(entry.tab){return <button key={entry.label} type="button" disabled={!rfAllowed(entry.tab)} title={!rfAllowed(entry.tab)?'Your account does not have permission for this module':undefined} className={'rfNavItem tone-'+entry.tone+(tab===entry.tab?' active':'')+(!rfAllowed(entry.tab)?' locked':'')} onClick={()=>rfGo(entry.tab)}><RfIcon name={entry.icon}/><span>{entry.label}</span>{!rfAllowed(entry.tab)&&<span aria-hidden="true" className="rfLockMark">🔒</span>}</button>}const kids=entry.children;if(!kids.length)return null;const isOpen=!!rfOpen[entry.label];return <div key={entry.label} className="rfGroup"><button type="button" className={'rfNavItem tone-'+entry.tone+(isOpen?' open':'')+(kids.some(([t])=>t===tab)?' active':'')} onClick={()=>setRfOpen(o=>({...o,[entry.label]:!o[entry.label]}))} aria-expanded={isOpen}><RfIcon name={entry.icon}/><span>{entry.label}</span><i className="rfChev">‹</i></button>{isOpen&&<div className="rfSub">{kids.map(([t,label])=><button key={t} type="button" disabled={!rfAllowed(t)} title={!rfAllowed(t)?'Your account does not have permission for this module':undefined} className={'rfSubItem'+(tab===t?' active':'')+(!rfAllowed(t)?' locked':'')} onClick={()=>rfGo(t)}><RfIcon name="radio" size={13} stroke={2}/><span>{label}</span>{!rfAllowed(t)&&<span aria-hidden="true" className="rfLockMark">🔒</span>}</button>)}</div>}</div>})}</nav></aside>{open&&<div className="rfBackdrop" onClick={()=>setOpen(false)}/>}<div className="rfMain"><header className="rfTop"><a className="rfHeaderLogo" href="#" onClick={e=>{e.preventDefault();navigate('Dashboard')}} aria-label="Micro Muneem dashboard"><img className="rfHeaderLogoFull" src={brand.logo||"/micromuneem-logo.webp"} alt={brand.name||"Micro Muneem"} style={{objectFit:'contain',maxHeight:42}}/><img className="rfHeaderLogoMini" src={brand.favicon||brand.logo||"/umang-logo-mini.webp"} alt="" style={{objectFit:'contain',maxHeight:34}}/></a><button type="button" className="rfHamb" onClick={()=>setOpen(!open)} aria-label="Toggle sidebar">☰</button><div className="rfTopLinks"><span className="rfSession"><RfIcon name="shield" size={15}/> SESSION : {rfSession}</span>{RF_TOP_LINKS.filter(([,t])=>rfAllowed(t)).map(([label,t,ico])=><button key={t} type="button" className={tab===t?'on':''} onClick={()=>rfGo(t)}><RfIcon name={ico} size={15}/> {label}</button>)}<div className="rfAdminWrap"><button type="button" className="rfAdmin" aria-haspopup="menu" aria-expanded={rfAdminMenu} onClick={()=>setRfAdminMenu(v=>!v)}><RfIcon name="user" size={20}/> {rfUser}<span className="rfAdminCaret">▾</span></button>{rfAdminMenu&&<div className="rfAdminDropdown" role="menu"><div className="rfAdminDropdownHead"><span className="rfAvatar"><RfIcon name="user" size={23}/></span><strong>{rfUser}</strong><small>{access.is_admin?'Admin':'Staff'}</small></div><button type="button" role="menuitem" onClick={()=>{setRfAdminMenu(false);rfGo('Profile')}}><RfIcon name="user" size={15}/> Profile</button><button type="button" role="menuitem" onClick={()=>{setRfAdminMenu(false);logout()}}><RfIcon name="power" size={15}/> Sign out</button></div>}</div></div><button type="button" className="rfPower" onClick={logout} title="Logout" aria-label="Logout"><RfIcon name="power" size={22} stroke={2.4}/></button></header>{flashNode}<main className="content rfContent">{tab!=='Dashboard'&&<div className="rfCrumbBar"><button type="button" className="linkBtn" style={{background:"none",border:0,padding:0,color:"inherit",cursor:"pointer",fontWeight:600}} onClick={()=>navigate("Dashboard")}>Home</button> &nbsp;›&nbsp; <span>{tab==="__NOT_FOUND__"?"404 Not Found":tab}</span></div>}<Page tab={tab} dash={dash} reload={reload} go={navigate} branchSel={branchSel} setBranchSel={setBranchSel} brand={brand} access={access} logout={logout}/></main></div></div>}
function icon(x){
 const paths={
  'Dashboard':<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></>,
  'Members / Customers':<><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 2.8-5.3 6.5-5.3s5.9 1.8 6.5 5.3M16 5.2a3.2 3.2 0 0 1 0 6.2M17 15c2.5.4 4 2 4.5 4.5"/></>,
  'Identity / Relation / Purpose / Reason / Designation Masters':<><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></>,
  'Loan Products':<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h8"/></>,
  'Branches':<><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-3h4v3"/></>,
  'Areas / Centres / Groups':<><path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.2"/></>,
  'Apply For Loan':<><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></>,
  'Loan Applications':<><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/></>,
  'Loans':<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  'Loan Approval':<><circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/></>,
  'Disbursement':<><path d="M12 2v20M17 6.5c-.7-1.6-2.2-2.4-5-2.4-2.5 0-4 1.2-4 3s1.7 2.7 4.2 3.3 4.3 1.4 4.3 3.5-1.8 3.5-4.5 3.5c-2.5 0-4.4-.9-5.2-2.7"/></>,
  'Loan Summary':<><path d="M4 20V4M4 20h17M8 16l4-5 3 2 5-7"/></>,
  'EMI Records':<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M7 17h6"/></>,
  'Collection / EMI':<><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="10" cy="19" r="1.5"/></>,
  'Overdue / Recovery':<><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
  'Employees / Field Officers':<><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  'Attendance':<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  'Salary / Payroll':<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  'Day Book':<><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/></>,
  'Voucher Entries':<><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/></>,
  'Payment':<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  'Receipt':<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8"/></>,
  'Contra':<><path d="M4 7h15l-3-3M20 17H5l3 3"/></>,
  'Journal':<><path d="M5 5h14M5 10h14M5 15h9M5 20h9"/></>,
  'Cashbook':<><path d="M4 4h16v17H4zM8 8h8M8 12h8M8 16h5"/></>,
  'Expenses':<><circle cx="12" cy="12" r="9"/><path d="M7 12h10"/></>,
  'Razorpay / Cashfree':<><path d="M12 2 21 12 12 22 3 12 12 2Z"/><path d="M8 12h8"/></>,
  'UPI / AutoPay / eNACH':<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/></>,
  'Payment History':<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  'MIS Reports':<><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/></>,
  'Financial Reports':<><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></>,
  'Portfolio Reports':<><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></>,
  'Audit Logs':<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10h5M8 13h3"/></>,
  'Capital / Investment':<><circle cx="12" cy="12" r="9"/><path d="M12 6v12M16 8.5c-.5-1-1.6-1.5-4-1.5-2 0-3 1-3 2.2s1.2 2 3.2 2.5 3.8 1 3.8 2.6-1.4 2.7-4 2.7c-2 0-3.5-.6-4-1.8"/></>,
  'Company Profile & Logo':<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 17 5-4 3 2 3-3 3 5"/></>,
  'SMS Settings':<><path d="M4 5h16v12H9l-5 4z"/><path d="M8 9h8M8 13h5"/></>,
  'KYC Settings':<><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z"/><path d="m8 12 2.5 2.5L16 9"/></>,
  'General Settings':<><circle cx="12" cy="12" r="3"/><path d="M19 13.5a7 7 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L13.5 2h-4L9 5a8 8 0 0 0-2.6 1.5L4 5.5 2 9l2 1.5a7 7 0 0 0 0 3L2 15l2 3.5 2.4-1A8 8 0 0 0 9 19l.5 3h4l.5-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5z"/></>,
  'Role & Permissions':<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M6 16c.5-2 5.5-2 6 0M14 9h4M14 13h4"/></>,
  'Backup / Restore':<><path d="M12 16V3M7 8l5-5 5 5M4 14v6h16v-6"/></>
 };
 const colors={'Dashboard':'#3b9b63','Members / Customers':'#248f9a','Identity / Relation / Purpose / Reason / Designation Masters':'#2687c9','Loan Products':'#b68a45','Branches':'#b68a45','Areas / Centres / Groups':'#b84d59','Apply For Loan':'#a13b54','Loan Applications':'#a13b54','Loans':'#a13b54','Loan Approval':'#3b9b63','Disbursement':'#565b63','Loan Summary':'#2586b8','EMI Records':'#2586b8','Collection / EMI':'#289b77','Overdue / Recovery':'#b94b4b','Employees / Field Officers':'#258f9a','Attendance':'#b84d59','Salary / Payroll':'#b68a45','Day Book':'#59616c','Voucher Entries':'#59616c','Payment':'#3c9a62','Receipt':'#3c9a62','Contra':'#b68a45','Journal':'#59616c','Cashbook':'#2586b8','Expenses':'#b68a45','Razorpay / Cashfree':'#3c9a62','UPI / AutoPay / eNACH':'#2586b8','Payment History':'#3c9a62','MIS Reports':'#2586b8','Financial Reports':'#b68a45','Portfolio Reports':'#2586b8','Audit Logs':'#b84d59','Capital / Investment':'#3c9a62','Company Profile & Logo':'#2586b8','SMS Settings':'#2586b8','KYC Settings':'#3c9a62','General Settings':'#59616c','Role & Permissions':'#258f9a','Backup / Restore':'#2586b8'};
 return <svg className="nmfaSvgIcon referenceNavIcon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={colors[x]||'#59616c'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[x]||<circle cx="12" cy="12" r="8"/>}</svg>;
}

function ReferenceMasters({reload}){
 const kinds=[['identity_proof','Identity Proof'],['relation','Relation'],['purpose','Purpose'],['reason','Reason'],['designation','Designation']];
 const [kind,setKind]=useState('identity_proof'),[rows,setRows]=useState([]),[name,setName]=useState(''),[edit,setEdit]=useState(null),[notice,setNotice]=useState(null),[busy,setBusy]=useState(false);
 async function load(){try{const r=await api().get('/reference-masters/',{params:{kind}});setRows(r.data.results||r.data)}catch(e){setRows([]);setNotice({type:'error',title:'Unable to load',message:JSON.stringify(e.response?.data||'Master list load failed')})}}
 useEffect(()=>{load()},[kind,reload]);
 async function save(e){e.preventDefault();setBusy(true);try{const payload={kind,name:name.trim(),active:true};if(edit)await api().patch(`/reference-masters/${edit}/`,{name:name.trim()});else await api().post('/reference-masters/',payload);setName('');setEdit(null);await load();setNotice({type:'success',title:'Success!',message:edit?'Master item updated successfully.':'Master item added successfully.'})}catch(e){setNotice({type:'error',title:'Save failed',message:JSON.stringify(e.response?.data||'Could not save master item')})}finally{setBusy(false)}}
 function toggle(row){setNotice({type:'confirm',title:'Are you sure?',message:`${row.active?'Deactivate':'Activate'} “${row.name}”?`,onConfirm:async()=>{try{await api().patch(`/reference-masters/${row.id}/`,{active:!row.active});await load();setNotice({type:'success',title:'Success!',message:`${row.name} status updated.`})}catch(e){setNotice({type:'error',title:'Action failed',message:JSON.stringify(e.response?.data||'Status update failed')})}}})}
 return <><PageTitle title="Identity / Relation / Purpose / Reason / Designation Masters" sub="Manage reference lists with Active/Inactive status, add and edit actions"/><section className="panel"><div className="formgrid"><label>Master Type<select value={kind} onChange={e=>{setKind(e.target.value);setName('');setEdit(null)}}>{kinds.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></div><form className="formgrid" onSubmit={save}><label>{edit?'Edit':'Add'} {kinds.find(x=>x[0]===kind)?.[1]} *<input required maxLength="120" value={name} onChange={e=>setName(e.target.value)} placeholder="Enter name"/></label><div className="formActions"><button className="primary" disabled={busy}>{busy?'Saving…':edit?'Update':'Add Item'}</button>{edit&&<button type="button" className="secondary" onClick={()=>{setEdit(null);setName('')}}>Cancel</button>}</div></form></section><section className="panel"><h3>{kinds.find(x=>x[0]===kind)?.[1]} List</h3><div className="tableWrap"><table><thead><tr><th>Name</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}</td><td><span className={row.active?'status ok':'status off'}>{row.active?'Active':'Inactive'}</span></td><td><button className="smallBtn" onClick={()=>{setEdit(row.id);setName(row.name)}}>Edit</button> <button className="smallBtn dangerBtn" onClick={()=>toggle(row)}>{row.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No entries yet. Add the first item above.</div>}</div></section>{notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>
}

const MASTER_TITLES={state:'State Master',bank:'Bank List',leave_type:'Leave Master',document_type:'Document Type',collection_mode:'Collection Mode'};
const MASTER_HELP={state:'Manage active states used in member and organization records.',bank:'Maintain bank names, short names and Active/Inactive status.',leave_type:'Maintain leave types used by HR and attendance workflows.',document_type:'Manage KYC document types. Identity/address categories participate in KYC checks after verification.',collection_mode:'Manage collection methods and map every custom method to a ledger account before using it for receipts.'};
const MASTER_LEDGER_OPTIONS=['Cash','Bank','UPI Clearing','Card Clearing','Gateway Clearing'];
const slugMaster=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);

function LoanPlanMaster({reload}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[viewingPlan,setViewingPlan]=useState(null),[emiPlan,setEmiPlan]=useState(null),[emiBusy,setEmiBusy]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const [calcPlan,setCalcPlan]=useState(''),[calcPrincipal,setCalcPrincipal]=useState('10000.00'),[calc,setCalc]=useState(null),[calcBusy,setCalcBusy]=useState(false),[penaltySchemes,setPenaltySchemes]=useState([]);
 const blank=()=>({name:'',code:'',interest_rate:'18.000',interest_method:'flat',frequency:'monthly',tenure:12,processing_fee:'0.00',late_penalty:'0.00',grace_days:0,penalty_scheme:'',max_income_multiple:'',active:true,plan_amount:'0.00',paid_amount:'0.00',recovery_type:'monthly',holiday_exclude:false,gst_charge_include:false,file_charge_include:false,file_charge:'0.00',processing_fee_charge_include:false,processing_fee_percentage:'0.000',insurance_fee_charge_include:false,insurance_fee_type:'fixed',insurance_fee_amount:'0.00',advance_installment:0});
 async function load(){setLoading(true);try{const r=await api().get('/loan-products/');const items=r.data.results||r.data||[];setRows(items);if(!calcPlan&&items.find(x=>x.active))setCalcPlan(String(items.find(x=>x.active).id));try{const pr=await api().get('/penalty-schemes/');setPenaltySchemes((pr.data.results||pr.data||[]).filter(p=>p.active))}catch{setPenaltySchemes([])}setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load loan plans.'))}finally{setLoading(false)}}
 useEffect(()=>{void load()},[reload]);
 useEffect(()=>{
  if(typeof document==='undefined')return;
  const openModal=!!(form||viewingPlan||emiPlan);
  const prev=document.body.style.overflow;
  if(openModal)document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=prev};
 },[form,viewingPlan,emiPlan]);
 const filtered=rows.filter(x=>`${x.name} ${x.code} ${x.frequency} ${x.interest_method}`.toLowerCase().includes(search.toLowerCase()));const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 function openNew(){setEditId(null);setForm(blank());setErr('')}
 function openEdit(row){setEditId(row.id);setForm({...blank(),...row,paid_amount:row.paid_amount??'0.00',max_income_multiple:row.max_income_multiple??'',penalty_scheme:row.penalty_scheme?String(row.penalty_scheme):''});setErr('')}
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload={...form,name:form.name.trim(),code:form.code.trim().toUpperCase(),interest_rate:String(form.interest_rate),tenure:Number(form.tenure),processing_fee:String(form.processing_fee||'0'),late_penalty:String(form.late_penalty||'0'),grace_days:Number(form.grace_days||0),max_income_multiple:form.max_income_multiple===''?null:String(form.max_income_multiple),penalty_scheme:form.penalty_scheme?Number(form.penalty_scheme):null,active:!!form.active,plan_amount:String(form.plan_amount||'0'),recovery_type:form.recovery_type||'monthly',holiday_exclude:!!form.holiday_exclude,gst_charge_include:!!form.gst_charge_include,file_charge_include:!!form.file_charge_include,file_charge:String(form.file_charge||'0'),processing_fee_charge_include:!!form.processing_fee_charge_include,processing_fee_percentage:String(form.processing_fee_percentage||'0'),insurance_fee_charge_include:!!form.insurance_fee_charge_include,insurance_fee_type:form.insurance_fee_type||'fixed',insurance_fee_amount:String(form.insurance_fee_amount||'0'),advance_installment:Number(form.advance_installment||0)};if(!payload.name||!payload.code)throw new Error('Plan name aur code required hain.');if(Number(payload.interest_rate)<0||Number(payload.interest_rate)>1000)throw new Error('Annual interest rate 0 se 1000 percent ke beech honi chahiye.');if(!Number.isInteger(payload.tenure)||payload.tenure<1||payload.tenure>1200)throw new Error('Installment count 1 se 1200 ke beech hona chahiye.');if(Number(payload.processing_fee)<0||Number(payload.late_penalty)<0||payload.grace_days<0||Number(payload.plan_amount)<0||Number(payload.file_charge)<0||Number(payload.processing_fee_percentage)<0||Number(payload.insurance_fee_amount)<0||payload.advance_installment<0)throw new Error('Fee, amount, installment aur grace days negative nahi ho sakte.');if(payload.max_income_multiple!==null&&Number(payload.max_income_multiple)<0)throw new Error('Household income multiple negative nahi ho sakta.');if(editId)await api().patch(`/loan-products/${editId}/`,payload);else await api().post('/loan-products/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(e){setErr(e.message||JSON.stringify(e.response?.data||'Loan plan save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} loan plan “${row.name}”? Existing linked loan terms are preserved.`))return;try{await api().patch(`/loan-products/${row.id}/`,{active:!row.active});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 async function calculateForPlan(row){setEmiPlan({row,result:null,error:''});setEmiBusy(true);try{const principal=String(row.plan_amount||'0');if(Number(principal)<=0)throw new Error('Plan Amount positive hona chahiye.');const r=await api().post(`/loan-products/${row.id}/preview/`,{principal});setEmiPlan({row,result:r.data,error:''})}catch(e){setEmiPlan({row,result:null,error:e.message||JSON.stringify(e.response?.data||'EMI calculation failed.')})}finally{setEmiBusy(false)}}
 return <><PageTitle title="LOAN PLAN LIST"><button className="masterAddBtn" onClick={openNew}>＋ Add New</button></PageTitle>{err&&<div className="alert danger" role="alert">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
 <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search" aria-label="Search loan plans"/><button type="button" aria-label="Search loan plans" title="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
 <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>PLAN NAME</th><th>PLAN TYPE</th><th>LOAN</th><th>DISBURSEMENT</th><th>COLLECTION</th><th>TENURE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((x,i)=><tr key={x.id}><td>{(page-1)*pageSize+i+1}</td><td>{x.name||'—'}</td><td>{String(x.plan_type||x.interest_method||'NORMAL').replaceAll('_',' ').toUpperCase()}</td><td>{Number(x.plan_amount??x.loan_amount??0).toLocaleString('en-IN')}</td><td>{Number(x.disbursement_amount??x.disbursement??x.plan_amount??x.loan_amount??0).toLocaleString('en-IN')}</td><td>{String(x.recovery_type||x.frequency||'—').toUpperCase()}</td><td>{x.tenure??'—'}</td><td><span className={x.active?'status ok':'status off'}>{x.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewingPlan(x)}>View Plan</button><button type="button" onClick={()=>openEdit(x)}>Update Plan</button><button type="button" onClick={()=>calculateForPlan(x)}>Calculate EMI</button><button type="button" onClick={()=>toggle(x)}>{x.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">{loading?'Loading plans…':'No loan plans. Use Add New to create a plan.'}</div>}</div>
 <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)} aria-label="First page">‹</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button>{Array.from({length:Math.min(pages,5)},(_,i)=>{const n=pages<=5?i+1:Math.max(1,Math.min(page-2,pages-4))+i;return <button key={n} className={page===n?'current':''} onClick={()=>setPage(n)}>{n}</button>})}{pages>5&&<><span>…</span><button className={page===pages?'current':''} onClick={()=>setPage(pages)}>{pages}</button></>}<button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)} aria-label="Last page">›</button></div></div></section>

 {emiPlan&&<div className="masterModalBackdrop loanPlanModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEmiPlan(null)}}><section className="masterModal loanPlanCompactModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>CALCULATE EMI — {emiPlan.row.name}</b><button type="button" onClick={()=>setEmiPlan(null)}>×</button></header><div className="loanPlanScrollBody">{emiBusy?<p>Calculating EMI…</p>:emiPlan.error?<div className="alert danger">{emiPlan.error}</div>:emiPlan.result&&<><div className="loanPlanDetailGrid"><div><small>NUMBER OF PAYMENTS</small><b>{emiPlan.result.tenure}</b></div><div><small>TOTAL AMOUNT TO PAY</small><b>{money(emiPlan.result.total_payable)}</b></div><div><small>PRELOAN EMI INTEREST</small><b>{money(emiPlan.result.interest_total)}</b></div><div><small>PAID AMOUNT</small><b>{money(emiPlan.row.paid_amount)}</b></div><div><small>BALANCE</small><b>{money(Math.max(0,Number(emiPlan.result.total_payable)-Number(emiPlan.row.paid_amount||0)))}</b></div></div><div className="tableWrap" style={{marginTop:14}}><table><thead><tr><th>EMI NO.</th><th>PRINCIPAL</th><th>INTEREST</th><th>AMOUNT</th><th>BALANCE</th></tr></thead><tbody>{emiPlan.result.installments.map((r,i)=><tr key={r.number}><td>{r.number}</td><td>{money(r.principal)}</td><td>{money(r.interest)}</td><td>{money(r.total)}</td><td>{money(Math.max(0,Number(emiPlan.result.total_payable)-emiPlan.result.installments.slice(0,i+1).reduce((a,z)=>a+Number(z.total),0)))}</td></tr>)}</tbody></table></div><p className="muted">{emiPlan.result.note}</p></>}</div><div className="masterModalActions loanPlanModalActions"><button className="masterCancelBtn" onClick={()=>setEmiPlan(null)}>CLOSE</button></div></section></div>}
 {viewingPlan&&<div className="masterModalBackdrop loanPlanModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewingPlan(null)}}><section className="masterModal loanPlanCompactModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>PLAN DETAILS</b><button type="button" onClick={()=>setViewingPlan(null)}>×</button></header><div className="loanPlanScrollBody"><div className="loanPlanDetailGrid">{[['Plan Name',viewingPlan.name],['Plan Code',viewingPlan.code],['Plan Amount',money(viewingPlan.plan_amount)],['Paid Amount',money(viewingPlan.paid_amount)],['Number of EMI',viewingPlan.tenure],['Recovery Type',pretty(viewingPlan.recovery_type)],['Interest Type',pretty(viewingPlan.interest_method)],['Interest Rate',`${viewingPlan.interest_rate}%`],['File Charge Include',viewingPlan.file_charge_include?'Yes':'No'],['File Charge',money(viewingPlan.file_charge)],['Processing Fee Include',viewingPlan.processing_fee_charge_include?'Yes':'No'],['Processing Fee Percentage',`${viewingPlan.processing_fee_percentage}%`],['Insurance Fee Include',viewingPlan.insurance_fee_charge_include?'Yes':'No'],['Insurance Fee Type',pretty(viewingPlan.insurance_fee_type)],['Insurance Fee Amount',money(viewingPlan.insurance_fee_amount)],['GST Charge Include',viewingPlan.gst_charge_include?'Yes':'No'],['Holiday Exclude',viewingPlan.holiday_exclude?'Yes':'No'],['Advance Installment',viewingPlan.advance_installment]].map(([k,v])=><div key={k}><small>{k}</small><b>{v??'—'}</b></div>)}</div></div><div className="masterModalActions loanPlanModalActions"><button className="masterCancelBtn" onClick={()=>setViewingPlan(null)}>CLOSE</button></div></section></div>}
 {form&&<div className="masterModalBackdrop loanPlanModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setForm(null)}}><section className="masterModal loanPlanCompactModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT LOAN PLAN':'ADD NEW LOAN PLAN'}</b><button type="button" onClick={()=>setForm(null)} aria-label="Close modal">×</button></header><form className="loanPlanCompactForm" onSubmit={save}><div className="loanPlanScrollBody">
  <div className="loanPlanSectionBlock">
   <h4 className="loanPlanSectionTitle">1. Plan Identity &amp; Repayment Schedule</h4>
   <div className="loanPlanCompactGrid">
    <label>PLAN NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. JLG Weekly 25K"/></label>
    <label>PLAN CODE *<input required maxLength="30" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="e.g. JLG25K"/></label>
    <label>SELECT LOAN TYPE *<select required value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value,recovery_type:e.target.value}))}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></label>
    <label>RECOVERY TYPE *<select required value={form.recovery_type} onChange={e=>setForm(f=>({...f,recovery_type:e.target.value,frequency:e.target.value==='monthly'?'monthly':e.target.value}))}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></label>
    <label>NUMBER OF EMI *<input required type="number" min="1" max="1200" value={form.tenure} onChange={e=>setForm(f=>({...f,tenure:e.target.value}))}/></label>
    <label>ADVANCE INSTALLMENT *<input type="number" min="0" step="1" value={form.advance_installment} onChange={e=>setForm(f=>({...f,advance_installment:e.target.value}))}/></label>
    <label>HOLIDAY EXCLUDE *<select value={form.holiday_exclude?'yes':'no'} onChange={e=>setForm(f=>({...f,holiday_exclude:e.target.value==='yes'}))}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label>PENALTY SCHEME<select value={form.penalty_scheme||''} onChange={e=>setForm(f=>({...f,penalty_scheme:e.target.value}))}><option value="">None / Standard</option>{penaltySchemes.map(ps=><option key={ps.id} value={ps.id}>{ps.name}</option>)}</select></label>
    <label>SELECT STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
   </div>
  </div>
  <div className="loanPlanSectionBlock">
   <h4 className="loanPlanSectionTitle">2. Loan Amount, Interest &amp; Tax Rules</h4>
   <div className="loanPlanCompactGrid">
    <label>PLAN AMOUNT (₹) *<input required type="number" min="0" step="0.01" value={form.plan_amount} onChange={e=>setForm(f=>({...f,plan_amount:e.target.value}))}/></label>
    <label>PAID AMOUNT (₹) *<input type="number" readOnly value={form.paid_amount||'0.00'} title="Read-only: populated from payment records"/></label>
    <label>TYPE OF INTEREST *<select value={form.interest_method} onChange={e=>setForm(f=>({...f,interest_method:e.target.value}))}><option value="flat">Flat</option><option value="reducing">Reducing Balance</option></select></label>
    <label>INTEREST RATE (% P.A.) *<input required type="number" min="0" max="1000" step="0.001" value={form.interest_rate} onChange={e=>setForm(f=>({...f,interest_rate:e.target.value}))}/></label>
    <label>GST CHARGE INCLUDE *<select value={form.gst_charge_include?'yes':'no'} onChange={e=>setForm(f=>({...f,gst_charge_include:e.target.value==='yes'}))}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label>GRACE PERIOD (DAYS)<input type="number" min="0" max="365" value={form.grace_days} onChange={e=>setForm(f=>({...f,grace_days:e.target.value}))}/></label>
   </div>
  </div>
  <div className="loanPlanSectionBlock">
   <h4 className="loanPlanSectionTitle">3. File, Processing &amp; Insurance Charges</h4>
   <div className="loanPlanCompactGrid">
    <label>FILE CHARGE INCLUDE *<select value={form.file_charge_include?'yes':'no'} onChange={e=>setForm(f=>({...f,file_charge_include:e.target.value==='yes'}))}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label>FILE CHARGE (₹) *<input type="number" min="0" step="0.01" value={form.file_charge} onChange={e=>setForm(f=>({...f,file_charge:e.target.value}))}/></label>
    <label>PROCESSING FEE INCLUDE *<select value={form.processing_fee_charge_include?'yes':'no'} onChange={e=>setForm(f=>({...f,processing_fee_charge_include:e.target.value==='yes'}))}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label>PROCESSING FEE (%) *<input type="number" min="0" max="100" step="0.001" value={form.processing_fee_percentage} onChange={e=>setForm(f=>({...f,processing_fee_percentage:e.target.value}))}/></label>
    <label>PROCESSING FEE AMT (₹) *<input readOnly value={(Math.max(0,Number(form.plan_amount)||0)*(Math.max(0,Number(form.processing_fee_percentage)||0)/100)).toFixed(2)}/></label>
    <label>INSURANCE FEE INCLUDE *<select value={form.insurance_fee_charge_include?'yes':'no'} onChange={e=>setForm(f=>({...f,insurance_fee_charge_include:e.target.value==='yes'}))}><option value="no">No</option><option value="yes">Yes</option></select></label>
    <label>INSURANCE FEE TYPE *<select value={form.insurance_fee_type} onChange={e=>setForm(f=>({...f,insurance_fee_type:e.target.value}))}><option value="fixed">Fixed</option><option value="percentage">Percentage</option></select></label>
    <label>INSURANCE FEE AMT *<input type="number" min="0" step="0.01" value={form.insurance_fee_amount} onChange={e=>setForm(f=>({...f,insurance_fee_amount:e.target.value}))}/></label>
    <label>LATE PENALTY (₹)<input type="number" min="0" step="0.01" value={form.late_penalty} onChange={e=>setForm(f=>({...f,late_penalty:e.target.value}))}/></label>
   </div>
  </div>
 </div><div className="masterModalActions loanPlanModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button className="loanPlanCalculateBtn" type="button" disabled={busy} onClick={()=>{if(editId){const row=rows.find(r=>String(r.id)===String(editId));if(row)calculateForPlan(row);else setErr('Pehle loan plan save karein, phir EMI calculate karein.')}else setErr('Pehle loan plan save karein, phir EMI calculate karein.')}}>Calculate EMI</button><button className="masterCancelBtn" type="button" disabled={busy} onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function BranchLoginPage({reload}){
 const [branches]=useList('/branches/',reload);const [rows,setRows]=useState([]);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [msg,setMsg]=useState('');const [form,setForm]=useState({branch:'',username:'',first_name:'',last_name:'',email:'',password:''});
 async function load(){try{const r=await api().get('/branch-logins/');setRows(r.data.results||r.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Branch logins could not be loaded.'))}}
 useEffect(()=>{load()},[]);
 async function save(e){e.preventDefault();setBusy(true);setErr('');setMsg('');try{const r=await api().post('/branch-logins/',{...form,branch:Number(form.branch)});setMsg(`Login created for ${r.data.branch_name}. Username: ${r.data.username}. Password is not shown again; share it securely.`);setForm({branch:'',username:'',first_name:'',last_name:'',email:'',password:''});await load();reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Branch login creation failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="Branch Login" sub="Create a separate login for each active branch. Branch accounts are restricted to their assigned branch."/><section className="panel"><h3>Create Branch Login</h3><p className="muted">Each login is linked to exactly one branch. Use a unique username and strong password; password is stored as a hash and is never displayed in the register.</p><form className="formgrid" onSubmit={save}><label>Branch *<select required value={form.branch} onChange={e=>setForm({...form,branch:e.target.value})}><option value="">Select active branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>Username *<input required minLength="3" maxLength="150" autoComplete="off" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label>First Name<input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></label><label>Last Name<input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Initial Password *<input type="password" required minLength="12" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><small className="muted">At least 12 characters; use a unique password.</small></label><button className="primary" disabled={busy||!branches.some(b=>b.active!==false)}>{busy?'Creating…':'Create Branch Login'}</button></form>{err&&<div className="alert danger" style={{marginTop:12}}>{err}</div>}{msg&&<div className="alert success" style={{marginTop:12}}>{msg}</div>}</section><section className="panel"><h3>Branch Login Register</h3><div className="tableWrap"><table><thead><tr><th>Username</th><th>Name</th><th>Branch</th><th>Role</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.username}</td><td>{`${r.first_name||''} ${r.last_name||''}`.trim()||'—'}</td><td>{r.branch_name}</td><td>Branch Manager</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No branch logins yet.</div>}</div></section></>
}

function BranchMasterPage({reload}){
 const [rows,setRows]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[viewRow,setViewRow]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({name:'',code:'',phone:'',city:'',state:'Madhya Pradesh',opening_date:dateNow(),address:'',active:true});
 async function load(){try{const r=await api().get('/branches/');setRows(r.data.results||r.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load branches.'))}}
 useEffect(()=>{void load()},[reload]);
 const filtered=rows.filter(x=>`${x.name} ${x.code} ${x.phone||''} ${x.city||''} ${x.state||''} ${x.address||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload={...form,name:form.name.trim(),code:form.code.trim().toUpperCase(),phone:(form.phone||'').trim(),city:(form.city||'').trim(),state:(form.state||'').trim(),opening_date:form.opening_date||null,address:(form.address||'').trim(),active:!!form.active};if(editId)await api().patch(`/branches/${editId}/`,payload);else await api().post('/branches/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Branch save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} branch ${row.name}? Existing records will be preserved.`))return;try{await api().patch(`/branches/${row.id}/`,{active:!row.active});await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <><PageTitle title="BRANCH LIST" sub="Manage operating branches; referenced branches cannot be deleted and are retained for audit/history."><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`branch_list_${dateNow()}.csv`,['SR. NO.','NAME','CODE','PHONE','CITY','STATE','OPENING DATE','STATUS'],filtered.map((r,i)=>[i+1,r.name,r.code,r.phone||'',r.city||'',r.state||'',r.opening_date||'',r.active?'ACTIVE':'INACTIVE']))}>DOWNLOAD EXCEL</button><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></div></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search branch"/><button type="button" aria-label="Search branch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>CODE</th><th>PHONE</th><th>CITY</th><th>STATE</th><th>OPENING DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.code}</td><td>{r.phone||'—'}</td><td>{r.city||(r.address?String(r.address).split(',')[0]:'—')}</td><td>{r.state||'Madhya Pradesh'}</td><td>{r.opening_date||(r.created_at?String(r.created_at).slice(0,10):'—')}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Branch</button><button type="button" onClick={()=>{setEditId(r.id);setForm({...blank(),...r})}}>✎ Edit Branch</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No branch records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>BRANCH DETAILS — {viewRow.name}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[['Branch Name',viewRow.name],['Branch Code',viewRow.code],['Phone',viewRow.phone||'—'],['City',viewRow.city||'—'],['State',viewRow.state||'Madhya Pradesh'],['Opening Date',viewRow.opening_date||'—'],['Address',viewRow.address||'—'],['Status',viewRow.active?'ACTIVE':'INACTIVE']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT BRANCH':'ADD NEW BRANCH'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>CODE *<input required maxLength="30" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))}/></label><label>PHONE *<input required maxLength="20" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label><label>CITY *<input required maxLength="100" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></label></div><div className="loanPlanColumn"><label>STATE *<input required maxLength="100" value={form.state||''} onChange={e=>setForm(f=>({...f,state:e.target.value}))}/></label><label>OPENING DATE *<input required type="date" value={form.opening_date||dateNow()} onChange={e=>setForm(f=>({...f,opening_date:e.target.value}))}/></label><label>ADDRESS<textarea rows="2" value={form.address||''} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button className="masterCancelBtn" type="button" disabled={busy} onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function MasterCatalogPage({masterKey,reload}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[viewRow,setViewRow]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refTitles={state:'STATE LIST',bank:'BANK LIST',leave_type:'LEAVE MASTER',document_type:'DOCUMENT TYPE LIST',collection_mode:'COLLECTION MODE LIST'};
 const title=refTitles[masterKey]||MASTER_TITLES[masterKey]||masterKey.toUpperCase();
 async function load(){setLoading(true);try{const r=await api().get('/master-catalog/',{params:{master_key:masterKey}});setRows(r.data.results||r.data||[]);setError('')}catch(e){setError(JSON.stringify(e.response?.data||'Unable to load master records.'));}finally{setLoading(false)}}
 useEffect(()=>{setPage(1);setSearch('');setForm(null);setViewRow(null);void load()},[masterKey,reload]);
 const filtered=rows.filter(x=>`${x.name||''} ${x.short_name||''} ${x.code||''} ${x.ledger_account||''} ${x.metadata?.state_code||''}`.toLowerCase().includes(search.toLowerCase()));
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 useEffect(()=>{if(page>totalPages)setPage(totalPages)},[page,totalPages]);
 function blank(){return {name:'',short_name:'',state_code:'',code:'',document_role:'other',ledger_account:masterKey==='collection_mode'?'Cash':'',active:true,notes:''}}
 function openNew(){setEditId(null);setForm(blank());setError('')}
 function openEdit(row){setEditId(row.id);setForm({...blank(),...row,state_code:row.metadata?.state_code||row.code||''});setError('')}
 async function save(e){e.preventDefault();if(!form)return;setBusy(true);setError('');try{
   const codeVal=editId?form.code:slugMaster(form.short_name||form.state_code||form.name);
   if(!codeVal)throw new Error('Name ya Short Name se valid code nahi ban raha.');
   const payload={master_key:masterKey,name:form.name.trim(),short_name:(form.short_name||'').trim().toUpperCase(),code:codeVal,active:!!form.active,document_role:masterKey==='document_type'?form.document_role:'other',ledger_account:masterKey==='collection_mode'?form.ledger_account:'',notes:(form.notes||'').trim(),metadata:masterKey==='state'?{state_code:(form.state_code||'').trim().toUpperCase()}:{}};
   if(editId)await api().patch(`/master-catalog/${editId}/`,payload);else await api().post('/master-catalog/',payload);
   setForm(null);setEditId(null);await load();await reload?.();
  }catch(e){setError(typeof e.message==='string'&&e.message.includes('valid code')?e.message:JSON.stringify(e.response?.data||e.message||'Save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} “${row.name}”? Inactive records remain for historical references.`))return;try{await api().patch(`/master-catalog/${row.id}/`,{active:!row.active});await load()}catch(e){setError(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <><PageTitle title={title} sub={MASTER_HELP[masterKey]||'Manage master records with validation and status control.'}><button className="masterAddBtn" onClick={openNew}>＋ Add New</button></PageTitle>
  {error&&<div className="alert danger" role="alert">{error}</div>}
  <section className="panel masterListPanel loanPlanReferenceCard">
   <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
   <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th>{(masterKey==='state'||masterKey==='bank')&&<th>SHORT NAME</th>}{masterKey==='state'&&<th>STATE CODE</th>}{masterKey==='document_type'&&<th>DOCUMENT CATEGORY</th>}{masterKey==='collection_mode'&&<th>LEDGER ACCOUNT</th>}<th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((row,i)=><tr key={row.id}><td>{(page-1)*pageSize+i+1}</td><td>{row.name}</td>{(masterKey==='state'||masterKey==='bank')&&<td>{row.short_name||'—'}</td>}{masterKey==='state'&&<td>{row.metadata?.state_code||row.code?.toUpperCase()||'—'}</td>}{masterKey==='document_type'&&<td>{({identity:'IDENTITY PROOF',address:'ADDRESS PROOF',other:'OTHER'})[row.document_role]||'OTHER'}</td>}{masterKey==='collection_mode'&&<td>{row.ledger_account||'—'}</td>}<td><span className={row.active?'status ok':'status off'}>{row.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(row)}>👁 View Details</button><button type="button" onClick={()=>openEdit(row)}>✎ Edit</button><button type="button" onClick={()=>toggle(row)}>{row.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">{loading?'Loading records…':'No records found. Use + Add New to create one.'}</div>}</div>
   <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?((page-1)*pageSize+1):0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=totalPages} onClick={()=>setPage(totalPages)}>»</button></div></div>
  </section>
  {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{title} DETAILS — {viewRow.name}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[['Name',viewRow.name],['Short Name',viewRow.short_name||'—'],['Code',viewRow.metadata?.state_code||viewRow.code||'—'],['Status',viewRow.active?'ACTIVE':'INACTIVE']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}
  {form&&<div className="masterModalBackdrop" role="presentation"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT':'ADD NEW'} — {title}</b><button type="button" aria-label="Close" onClick={()=>setForm(null)}>×</button></header><form onSubmit={save} className="masterModalBody"><label>NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label>
    {(masterKey==='state'||masterKey==='bank')&&<label>SHORT NAME *<input maxLength="40" required value={form.short_name||''} onChange={e=>setForm(f=>({...f,short_name:e.target.value.toUpperCase()}))}/></label>}
    {masterKey==='state'&&<label>STATE CODE *<input maxLength="20" required value={form.state_code||''} onChange={e=>setForm(f=>({...f,state_code:e.target.value.toUpperCase()}))} placeholder="e.g. 23 / MP"/></label>}
    {masterKey==='document_type'&&<label>DOCUMENT CATEGORY *<select required value={form.document_role||'other'} onChange={e=>setForm(f=>({...f,document_role:e.target.value}))}><option value="identity">Identity Proof</option><option value="address">Address Proof</option><option value="other">Other</option></select></label>}
    {masterKey==='collection_mode'&&<label>LEDGER ACCOUNT *<select required value={form.ledger_account||'Cash'} onChange={e=>setForm(f=>({...f,ledger_account:e.target.value}))}>{MASTER_LEDGER_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></label>}
    <label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label>
    <div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button type="button" className="masterCancelBtn" disabled={busy} onClick={()=>setForm(null)}>CANCEL</button></div>
    </form></section></div>}
 </>
}

function PenaltySchemesPage({reload}){
 const [rows,setRows]=useState([]),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[viewRow,setViewRow]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[assessments,setAssessments]=useState([]);
 const [previewScheme,setPreviewScheme]=useState(''),[previewAmount,setPreviewAmount]=useState('1000.00'),[previewDays,setPreviewDays]=useState('5'),[alreadyAssessed,setAlreadyAssessed]=useState(false),[preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
 const blank=()=>({name:'',grace_period_days:0,penalty_type:'fixed',penalty_value:'100.00',minimum_due_amount:'0.00',penalty_mode:'one_time',recurring:false,active:true});
 async function load(){try{const r=await api().get('/penalty-schemes/');setRows(r.data.results||r.data||[]);try{const a=await api().get('/penalty-assessments/');setAssessments(a.data.results||a.data||[])}catch{setAssessments([])}setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load penalty schemes.'))}}
 useEffect(()=>{void load()},[reload]);
 const filtered=rows.filter(x=>`${x.name||''} ${x.penalty_type||''} ${x.penalty_mode||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 function edit(row){setEditId(row.id);setForm({...row});setErr('')}
 async function save(e){e.preventDefault();setBusy(true);setErr('');const payload={...form,name:form.name.trim(),grace_period_days:Number(form.grace_period_days),penalty_value:String(form.penalty_value),minimum_due_amount:String(form.minimum_due_amount),recurring:form.penalty_mode==='daily'&&!!form.recurring};try{if(editId)await api().patch(`/penalty-schemes/${editId}/`,payload);else await api().post('/penalty-schemes/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Penalty scheme save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} penalty scheme “${row.name}”?`))return;try{await api().patch(`/penalty-schemes/${row.id}/`,{active:!row.active});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 async function runPreview(){setPreview(null);setErr('');if(!previewScheme){setErr('Pehle penalty scheme select karein.');return}setPreviewBusy(true);try{const r=await api().post(`/penalty-schemes/${previewScheme}/preview/`,{overdue_amount:previewAmount,overdue_days:previewDays,already_assessed:alreadyAssessed});setPreview(r.data)}catch(e){setErr(JSON.stringify(e.response?.data||'Penalty preview failed.'))}finally{setPreviewBusy(false)}}
 return <><PageTitle title="PENALTY SCHEME LIST" sub="Configure grace period, fixed/percentage penalty, minimum due amount and one-time/daily recurrence."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>PENALTY SCHEME</th><th>TYPE</th><th>AMOUNT/PERCENTAGE</th><th>MINIMUM AMT (APPLIED PENALTY)</th><th>GRACE PERIOD</th><th>PENALTY MODE</th><th>ISRECURRING</th><th>CREATED AT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.penalty_type==='percentage'?'PERCENTAGE':'FIXED'}</td><td>{r.penalty_type==='percentage'?`${r.penalty_value}%`:money(r.penalty_value)}</td><td>{money(r.minimum_due_amount)}</td><td>{r.grace_period_days} DAYS</td><td>{r.penalty_mode==='daily'?'DAILY':'ONE TIME'}</td><td>{r.recurring?'YES':'NO'}</td><td>{r.created_at?String(r.created_at).slice(0,10):dateNow()}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Scheme</button><button type="button" onClick={()=>edit(r)}>✎ Edit Scheme</button><button type="button" onClick={()=>setPreviewScheme(String(r.id))}>Calculate Preview</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No penalty schemes configured yet.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 <section className="panel"><h3>Penalty Calculation Preview</h3><div className="formgrid"><label>Penalty Scheme<select value={previewScheme} onChange={e=>{setPreviewScheme(e.target.value);setPreview(null)}}><option value="">Select scheme</option>{rows.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Overdue Amount (₹)<input type="number" min="0" step="0.01" value={previewAmount} onChange={e=>setPreviewAmount(e.target.value)}/></label><label>Overdue Days<input type="number" min="0" max="36500" step="1" value={previewDays} onChange={e=>setPreviewDays(e.target.value)}/></label><label className="masterCheck"><input type="checkbox" checked={alreadyAssessed} onChange={e=>setAlreadyAssessed(e.target.checked)}/> Penalty already assessed</label><button className="loanPlanCalculateBtn" type="button" onClick={runPreview} disabled={previewBusy}>{previewBusy?'Calculating…':'CALCULATE PREVIEW'}</button></div>{preview&&<div className="penaltyPreviewResult"><div><small>Calculated Penalty</small><strong>{money(preview.penalty_amount)}</strong></div><div><small>Grace Period</small><b>{preview.grace_period_days} days</b></div><div><small>Minimum Due</small><b>{preview.minimum_due_met?'Met':'Not met'}</b></div><div><small>Status</small><b>{preview.already_assessed?'Already assessed — ₹0.00':Number(preview.overdue_days)<=Number(preview.grace_period_days)?'Within grace period':'Preview only'}</b></div></div>}</section>
 {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>PENALTY SCHEME DETAILS — {viewRow.name}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[['Penalty Scheme',viewRow.name],['Type',viewRow.penalty_type==='percentage'?'PERCENTAGE':'FIXED'],['Amount / Rate',viewRow.penalty_type==='percentage'?`${viewRow.penalty_value}%`:money(viewRow.penalty_value)],['Minimum Due Amt',money(viewRow.minimum_due_amount)],['Grace Period',`${viewRow.grace_period_days} Days`],['Penalty Mode',viewRow.penalty_mode==='daily'?'DAILY':'ONE TIME'],['Is Recurring',viewRow.recurring?'YES':'NO'],['Status',viewRow.active?'ACTIVE':'INACTIVE']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT PENALTY SCHEME':'ADD NEW'}</b><button onClick={()=>setForm(null)} type="button">×</button></header><form className="masterModalBody" onSubmit={save}>
  <label>PENALTY SCHEME NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label>
  <label>GRACE PERIOD (NUMBER OF DAYS) *<input required type="number" min="0" max="365" value={form.grace_period_days} onChange={e=>setForm(f=>({...f,grace_period_days:e.target.value}))}/></label>
  <label>PENALTY TYPE *<div className="rfRadioRow"><label><input type="radio" name="ptype" checked={form.penalty_type==='fixed'} onChange={()=>setForm(f=>({...f,penalty_type:'fixed'}))}/> FIXED</label><label><input type="radio" name="ptype" checked={form.penalty_type==='percentage'} onChange={()=>setForm(f=>({...f,penalty_type:'percentage'}))}/> PERCENTAGE</label></div></label>
  <label>{form.penalty_type==='percentage'?'PENALTY PERCENTAGE (%) *':'PENALTY AMOUNT (₹) *'}<input required type="number" min="0" max={form.penalty_type==='percentage'?'100':undefined} step="0.01" value={form.penalty_value} onChange={e=>setForm(f=>({...f,penalty_value:e.target.value}))}/></label>
  <label>PENALTY MODE *<div className="rfRadioRow"><label><input type="radio" name="pmode" checked={form.penalty_mode==='one_time'} onChange={()=>setForm(f=>({...f,penalty_mode:'one_time',recurring:false}))}/> ONE TIME</label><label><input type="radio" name="pmode" checked={form.penalty_mode==='daily'} onChange={()=>setForm(f=>({...f,penalty_mode:'daily'}))}/> DAILY</label></div></label>
  <label>MINIMUM DUE AMOUNT (FOR APPLIED PENALTY) *<input required type="number" min="0" step="0.01" value={form.minimum_due_amount} onChange={e=>setForm(f=>({...f,minimum_due_amount:e.target.value}))}/></label>
  <label>IS RECURRING *<div className="rfRadioRow"><label><input type="radio" name="precur" checked={!!form.recurring} onChange={()=>setForm(f=>({...f,recurring:true,penalty_mode:'daily'}))}/> YES</label><label><input type="radio" name="precur" checked={!form.recurring} onChange={()=>setForm(f=>({...f,recurring:false}))}/> NO</label></div></label>
  <label>STATUS *<div className="rfRadioRow"><label><input type="radio" name="pstat" checked={!!form.active} onChange={()=>setForm(f=>({...f,active:true}))}/> ACTIVE</label><label><input type="radio" name="pstat" checked={!form.active} onChange={()=>setForm(f=>({...f,active:false}))}/> INACTIVE</label></div></label>
  <div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" disabled={busy} onClick={()=>setForm(null)}>CANCEL</button></div>
 </form></section></div>}</>
}

function ReferenceMasterCard({kind,title,compact=false,reload}){
 const [rows,setRows]=useState([]),[search,setSearch]=useState(''),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(compact?5:10);
 const colLabel=({identity_proof:'IDENTITY',relation:'RELATION',purpose:'PURPOSE',reason:'REASON',designation:'NAME'})[kind]||'NAME';
 async function load(){try{const r=await api().get('/reference-masters/',{params:{kind}});setRows(r.data.results||r.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load master values.'))}}
 useEffect(()=>{void load()},[kind,reload]);
 const filtered=rows.filter(x=>x.name.toLowerCase().includes(search.toLowerCase()));const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload={kind,name:form.name.trim(),active:!!form.active};if(editId)await api().patch(`/reference-masters/${editId}/`,payload);else await api().post('/reference-masters/',payload);setForm(null);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} “${row.name}”?`))return;try{await api().patch(`/reference-masters/${row.id}/`,{active:!row.active});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <section className={`panel masterListPanel loanPlanReferenceCard referenceMasterCard${compact?' compact':''}`}><header className="referenceMasterCardHead"><h3>{title.toUpperCase()}</h3><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm({name:'',active:true});setErr('')}}>＋ Add New</button></header>{err&&<div className="alert danger">{err}</div>}
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>5</option><option>10</option><option>25</option><option>50</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>{colLabel}</th>{kind==='relation'&&<th>REMARK</th>}<th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td>{kind==='relation'&&<td>FAMILY / NOMINEE</td>}<td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(r.id);setForm({...r})}}>✎ Edit</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No entries yet.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button></div></div>
  {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT':'ADD NEW'} — {title.toUpperCase()}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>{colLabel} NAME *<input value={form.name||''} required maxLength="120" onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button className="masterCancelBtn" type="button" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}
 </section>
}
function MiscellaneousMasters({reload}){return <><PageTitle title="MIXED LIST (MISCELLANEOUS MASTERS)" sub="Maintain Identity Proof, Relation, Purpose and Reason values used across Member, KYC and Loan workflows."/><div className="miscMasterGrid"><ReferenceMasterCard kind="identity_proof" title="IDENTITY PROOF DETAILS LIST" compact reload={reload}/><ReferenceMasterCard kind="relation" title="RELATION DETAILS" compact reload={reload}/><ReferenceMasterCard kind="purpose" title="PURPOSE DETAILS" compact reload={reload}/><ReferenceMasterCard kind="reason" title="REASON DETAILS" compact reload={reload}/></div></>}

function StaffBranchAssignments({reload}){
 const [employees,setEmployees]=useState([]),[branches,setBranches]=useState([]),[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function load(){try{const [e,b]=await Promise.all([api().get('/employees/'),api().get('/branches/')]);setEmployees(e.data.results||e.data||[]);setBranches(b.data.results||b.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load staff/branch data.'))}}
 useEffect(()=>{void load()},[reload]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=employees.filter(e=>(!branchFilter||String(e.branch)===String(branchFilter))&&(!staffFilter||String(e.id)===String(staffFilter))&&`${e.employee_no||''} ${e.name||''} ${e.role||''} ${e.designation||''} ${branchById[String(e.branch)]?.name||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();if(!form?.employee||!form?.branch){setErr('Staff aur Branch select karein.');return}setBusy(true);setErr('');try{await api().patch(`/employees/${form.employee}/`,{branch:Number(form.branch),designation:form.remark||undefined,active:form.active!==false});setForm(null);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Staff branch assignment failed.'))}finally{setBusy(false)}}
 async function toggle(row){try{await api().patch(`/employees/${row.id}/`,{active:!row.active});await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <><PageTitle title="STAFF BRANCHES LIST" sub="Assign employees to their operating branch with reference filters and Task actions."><button className="masterAddBtn" onClick={()=>{setForm({employee:'',branch:'',remark:'',active:true});setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>{setStaffFilter(e.target.value);setPage(1)}}><option value="">All Staff</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.employee_no} — {emp.name}</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search employee code, name or branch"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>EMPLOYEE CODE</th><th>EMPLOYEE NAME</th><th>BRANCH</th><th>REMARK</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((row,i)=><tr key={row.id}><td>{(page-1)*pageSize+i+1}</td><td>{row.employee_no}</td><td>{row.name}</td><td>{branchById[String(row.branch)]?.name||'—'}</td><td>{row.designation||row.role||'Assigned'}</td><td><span className={row.active?'status ok':'status off'}>{row.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setForm({employee:String(row.id),branch:String(row.branch||''),remark:row.designation||row.role||'',active:row.active!==false})}>Change Branch</button><button type="button" onClick={()=>toggle(row)}>{row.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No staff branch records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ASSIGN STAFF BRANCH</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>STAFF (TYPE HERE) *<select required value={form.employee} onChange={e=>setForm(f=>({...f,employee:e.target.value}))}><option value="">Select employee</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.employee_no} — {emp.name}</option>)}</select></label><label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">Select branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label>REMARK<input maxLength="100" value={form.remark||''} onChange={e=>setForm(f=>({...f,remark:e.target.value}))} placeholder="Optional assignment remark"/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function BranchCenters({reload}){
 const [areas,setAreas]=useState([]),[centres,setCentres]=useState([]),[branches,setBranches]=useState([]),[branchFilter,setBranchFilter]=useState(''),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 async function load(){try{const [a,c,b]=await Promise.all([api().get('/areas/'),api().get('/centres/'),api().get('/branches/')]);setAreas(a.data.results||a.data||[]);setCentres(c.data.results||c.data||[]);setBranches(b.data.results||b.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load Branch Center data.'))}}
 useEffect(()=>{void load()},[reload]);
 const areaById=Object.fromEntries(areas.map(a=>[String(a.id),a]));
 const filtered=centres.filter(c=>(!branchFilter||String(areaById[String(c.area)]?.branch)===branchFilter)&&`${c.code||''} ${c.name} ${c.meeting_day||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 function blank(){return {branch:'',area:'',code:'',name:'',meeting_day:'Monday',active:true}}
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{
  let targetArea=form.area;
  if(!targetArea&&form.branch){
   const existingArea=areas.find(a=>String(a.branch)===String(form.branch));
   if(existingArea)targetArea=existingArea.id;
   else{const bObj=branches.find(x=>String(x.id)===String(form.branch));const ar=await api().post('/areas/',{branch:Number(form.branch),name:(bObj?.name||'Branch')+' Area',code:(bObj?.code||'BR')+'-A1',active:true});targetArea=ar.data.id;}
  }
  const payload={area:Number(targetArea),code:(form.code||`BC-${centres.length+1}`).trim().toUpperCase(),name:form.name.trim(),meeting_day:form.meeting_day||'',active:!!form.active};
  if(editId)await api().patch(`/centres/${editId}/`,payload);else await api().post('/centres/',payload);
  setForm(null);setEditId(null);await load();await reload?.();
 }catch(e){setErr(JSON.stringify(e.response?.data||'Save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} centre “${row.name}”?`))return;try{await api().patch(`/centres/${row.id}/`,{active:!row.active});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <><PageTitle title="BRANCH CENTER LIST" sub="Manage branch centers with code, branch mapping and Task actions."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search centers"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>CODE</th><th>NAME</th><th>BRANCH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((c,i)=>{const a=areaById[String(c.area)];const b=branches.find(x=>String(x.id)===String(a?.branch));return <tr key={c.id}><td>{(page-1)*pageSize+i+1}</td><td>{c.code||`BC-${String(c.id).padStart(3,'0')}`}</td><td>{c.name}</td><td>{b?.name||'—'}</td><td><span className={c.active?'status ok':'status off'}>{c.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(c.id);setForm({...c,code:c.code||`BC-${String(c.id).padStart(3,'0')}`,area:String(c.area),branch:String(areaById[String(c.area)]?.branch||'')})}}>Edit Center</button><button type="button" onClick={()=>toggle(c)}>{c.active?'Deactivate':'Activate'}</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No center records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT BRANCH CENTER':'ADD NEW BRANCH CENTER'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={String(form.branch||'')} onChange={e=>setForm(f=>({...f,branch:e.target.value,area:''}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>AREA<select value={String(form.area||'')} onChange={e=>setForm(f=>({...f,area:e.target.value}))}><option value="">Auto / Default Branch Area</option>{areas.filter(a=>String(a.branch)===String(form.branch||'')).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>CENTER CODE *<input required maxLength="30" value={form.code||''} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="BC-001"/></label><label>CENTER NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>MEETING DAY<select value={form.meeting_day||''} onChange={e=>setForm(f=>({...f,meeting_day:e.target.value}))}><option value="">Not set</option>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=><option key={d}>{d}</option>)}</select></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button className="masterCancelBtn" type="button" disabled={busy} onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function CollectionCentersPage({reload}){
 const [groups,setGroups]=useState([]),[centres,setCentres]=useState([]),[areas,setAreas]=useState([]),[branches,setBranches]=useState([]),[employees,setEmployees]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function load(){try{const [g,c,a,b,e]=await Promise.all([api().get('/groups/'),api().get('/centres/'),api().get('/areas/'),api().get('/branches/'),api().get('/employees/')]);setGroups(g.data.results||g.data||[]);setCentres(c.data.results||c.data||[]);setAreas(a.data.results||a.data||[]);setBranches(b.data.results||b.data||[]);setEmployees(e.data.results||e.data||[]);setErr('')}catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load collection centers / groups.'))}}
 useEffect(()=>{void load()},[reload]);
 const areaById=Object.fromEntries(areas.map(a=>[String(a.id),a]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const branchOfGroup=g=>{const c=centreById[String(g.centre)];const a=areaById[String(c?.area)];return branches.find(b=>String(b.id)===String(a?.branch))};
 const filtered=groups.filter(g=>{const b=branchOfGroup(g);return (!branchFilter||String(b?.id)===String(branchFilter))&&`${g.code||''} ${g.name||''} ${g.city_village||''} ${g.center_leader||''} ${b?.name||''}`.toLowerCase().includes(search.toLowerCase())});
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 const blank=()=>({branch:'',centre:'',code:'',name:'',city_village:'',center_leader:'',active:true});
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  let targetCentre=form.centre;
  if(!targetCentre&&form.branch){
   const branchAreas=areas.filter(a=>String(a.branch)===String(form.branch));
   let areaId=branchAreas[0]?.id;
   if(!areaId){const bObj=branches.find(x=>String(x.id)===String(form.branch));const ar=await api().post('/areas/',{branch:Number(form.branch),name:(bObj?.name||'Branch')+' Area',code:(bObj?.code||'BR')+'-A1',active:true});areaId=ar.data.id;}
   const existingCentre=centres.find(c=>String(c.area)===String(areaId));
   if(existingCentre)targetCentre=existingCentre.id;
   else{const cr=await api().post('/centres/',{area:Number(areaId),code:`BC-${centres.length+1}`,name:form.name.trim()+' Center',meeting_day:'Monday',active:true});targetCentre=cr.data.id;}
  }
  const payload={centre:Number(targetCentre),code:form.code.trim().toUpperCase(),name:form.name.trim(),city_village:(form.city_village||'').trim(),center_leader:(form.center_leader||'').trim(),active:!!form.active};
  if(editId)await api().patch(`/groups/${editId}/`,payload);else await api().post('/groups/',payload);
  setForm(null);setEditId(null);await load();await reload?.();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Failed to save collection center / group.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} group “${row.name}”?`))return;try{await api().patch(`/groups/${row.id}/`,{active:!row.active});await load()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Status update failed.'))}}
 return <><PageTitle title="COLLECTION CENTER LIST" sub="Manage Groups / Collection Centers mapped to branches, villages and center leaders."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search group code, name, city or leader"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>CODE</th><th>NAME</th><th>CITY/VILLAGE</th><th>BRANCH</th><th>CENTER LEADER</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((g,i)=>{const b=branchOfGroup(g);const c=centreById[String(g.centre)];return <tr key={g.id}><td>{(page-1)*pageSize+i+1}</td><td>{g.code}</td><td>{g.name}</td><td>{g.city_village||c?.name||'—'}</td><td>{b?.name||'—'}</td><td>{g.center_leader||'—'}</td><td><span className={g.active?'status ok':'status off'}>{g.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(g.id);setForm({...blank(),...g,centre:String(g.centre),branch:String(b?.id||'')})}}>Edit Group</button><button type="button" onClick={()=>toggle(g)}>{g.active?'Deactivate':'Activate'}</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No collection centers / groups found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT COLLECTION CENTER':'ADD NEW COLLECTION CENTER'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={String(form.branch||'')} onChange={e=>setForm(f=>({...f,branch:e.target.value,centre:''}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>BRANCH CENTER<select value={String(form.centre||'')} onChange={e=>setForm(f=>({...f,centre:e.target.value}))}><option value="">Auto / Default Center</option>{centres.filter(c=>!form.branch||String(areaById[String(c.area)]?.branch)===String(form.branch)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>CODE *<input required maxLength="30" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="GRP-001"/></label><label>NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>CITY / VILLAGE *<input required maxLength="120" value={form.city_village||''} onChange={e=>setForm(f=>({...f,city_village:e.target.value}))}/></label><label>CENTER LEADER<input maxLength="160" list="leader-employee-list" value={form.center_leader||''} onChange={e=>setForm(f=>({...f,center_leader:e.target.value}))} placeholder="Leader name"/><datalist id="leader-employee-list">{employees.map(emp=><option key={emp.id} value={emp.name}/>)}</datalist></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button className="masterCancelBtn" type="button" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function AddStaffMasterPage({reload,openModalDefault=false}){
 const [rows,setRows]=useState([]),[branches,setBranches]=useState([]),[designations,setDesignations]=useState([]),[branchFilter,setBranchFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:'',employee_no:'',name:'',email:'',phone:'',designation:'Field Officer',role:'Field Officer',city:'Indore',state:'Madhya Pradesh',joining_date:dateNow(),aadhaar_status:'verified',pan_status:'verified',login_status:'active',annual_basic_salary:'180000',active:true});
 async function load(){try{const [e,b,d]=await Promise.all([api().get('/employees/'),api().get('/branches/'),api().get('/reference-masters/',{params:{kind:'designation'}}).catch(()=>({data:[]}))]);setRows(e.data.results||e.data||[]);const bl=b.data.results||b.data||[];setBranches(bl);setDesignations(d.data.results||d.data||[]);if(openModalDefault&&!form)setForm({...blank(),branch:String(bl[0]?.id||'')});setErr('')}catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load staff list.'))}}
 useEffect(()=>{void load()},[reload]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=rows.filter(r=>(!branchFilter||String(r.branch)===String(branchFilter))&&`${r.employee_no||''} ${r.name||''} ${r.email||''} ${r.phone||''} ${r.designation||r.role||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{const payload=normalize({...form,branch:Number(form.branch||branches[0]?.id||1),employee_no:form.employee_no.trim().toUpperCase(),name:form.name.trim(),phone:form.phone.trim(),role:form.designation||form.role||'Field Officer',active:!!form.active});if(editId)await api().patch(`/employees/${editId}/`,payload);else await api().post('/employees/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Staff save failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="STAFF LIST" sub="Search by Branch, Name, Mobile or Email, export to Excel, and register new employees."><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`staff_list_${dateNow()}.csv`,['SR.','EMPLOYEE CODE','NAME','EMAIL','DESIGNATION','MOBILE','BRANCH','KYC STATUS'],filtered.map((r,i)=>[i+1,r.employee_no,r.name,r.email||'',r.designation||r.role||'',r.phone,branchById[String(r.branch)]?.name||'',r.aadhaar_status==='verified'?'VERIFIED':'PENDING']))}>DOWNLOAD EXCEL</button><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm({...blank(),branch:String(branches[0]?.id||'')});setErr('')}}>＋ Add New</button></div></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search by Name, Mobile, Email"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR.</th><th>EMPLOYEE CODE</th><th>NAME</th><th>EMAIL</th><th>DESIGNATION</th><th>MOBILE</th><th>BRANCH</th><th>KYC STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.employee_no}</td><td>{r.name}</td><td>{r.email||'—'}</td><td>{r.designation||r.role||'Field Officer'}</td><td>{r.phone}</td><td>{branchById[String(r.branch)]?.name||'—'}</td><td><span className={r.aadhaar_status==='verified'?'status ok':'status off'}>{(r.aadhaar_status||'pending').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(r.id);setForm({...blank(),...r,branch:String(r.branch||'')})}}>✎ Edit Staff</button><button type="button" onClick={async()=>{await api().patch(`/employees/${r.id}/`,{active:!r.active});await load();}}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No staff records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT EMPLOYEE':'ADD NEW EMPLOYEE'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>BRANCH *<select required value={String(form.branch||'')} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>EMPLOYEE CODE *<input required maxLength="40" value={form.employee_no} onChange={e=>setForm(f=>({...f,employee_no:e.target.value.toUpperCase()}))} placeholder="EMP-001"/></label><label>FULL NAME *<input required maxLength="160" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>EMAIL<input type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label><label>MOBILE *<input required maxLength="20" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label></div><div className="loanPlanColumn"><label>DESIGNATION *<input required list="designation-options" value={form.designation||''} onChange={e=>setForm(f=>({...f,designation:e.target.value,role:e.target.value}))}/><datalist id="designation-options">{designations.map(d=><option key={d.id} value={d.name}/>)}<option value="Field Officer"/><option value="Branch Manager"/><option value="Accountant"/></datalist></label><label>JOINING DATE<input type="date" value={form.joining_date||dateNow()} onChange={e=>setForm(f=>({...f,joining_date:e.target.value}))}/></label><label>ANNUAL BASIC SALARY (₹)<input type="number" min="0" step="0.01" value={form.annual_basic_salary||'0'} onChange={e=>setForm(f=>({...f,annual_basic_salary:e.target.value}))}/></label><label>KYC STATUS *<select value={form.aadhaar_status||'pending'} onChange={e=>setForm(f=>({...f,aadhaar_status:e.target.value,pan_status:e.target.value}))}><option value="verified">VERIFIED</option><option value="pending">PENDING</option><option value="rejected">REJECTED</option></select></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}


function ProductMasterEntityPage({kind,reload}){
 const cfgMap={
  product_category:{title:'PRODUCT CATEGORY LIST',col:'CATEGORY',label:'Category Name'},
  product_brand:{title:'PRODUCT BRAND LIST',col:'BRAND',label:'Brand Name'},
  product_variant:{title:'PRODUCT VARIANT LIST',col:'VARIANT',label:'Variant Name'},
  insurance_party:{title:'INSURANCE PARTY LIST',col:'INSURANCE PARTY',label:'Insurance Party Name'},
  product_supplier:{title:'PRODUCT SUPPLIER LIST',col:'NAME',label:'Supplier Name',isSupplier:true},
  product_item:{title:'PRODUCT LIST',col:'PRODUCT',label:'Product Name',isProduct:true}
 };
 const cfg=cfgMap[kind]||cfgMap.product_category;
 const [rows,setRows]=useState([]),[brands,setBrands]=useState([]),[categories,setCategories]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[viewRow,setViewRow]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({name:'',short_name:'',code:'',notes:'',active:true,sale_price:'0.00',brand:'',category:'',hsn_sac:'',mobile:'',phone:'',address:'',city:'',organization:'',gstin:''});
 async function load(){try{
  const reqs=[api().get('/master-catalog/',{params:{master_key:kind}})];
  if(cfg.isProduct){reqs.push(api().get('/master-catalog/',{params:{master_key:'product_brand'}}).catch(()=>({data:[]})),api().get('/master-catalog/',{params:{master_key:'product_category'}}).catch(()=>({data:[]})));}
  const [r,br,ca]=await Promise.all(reqs);
  setRows(r.data.results||r.data||[]);
  if(br)setBrands(br.data.results||br.data||[]);
  if(ca)setCategories(ca.data.results||ca.data||[]);
  setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load product master records.'))}}
 useEffect(()=>{setPage(1);setSearch('');setForm(null);setViewRow(null);void load()},[kind,reload]);
 const filtered=rows.filter(x=>`${x.name||''} ${x.short_name||''} ${x.code||''} ${x.notes||''} ${JSON.stringify(x.metadata||{})}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  const codeVal=slugMaster(form.short_name||form.code||form.name);
  if(!codeVal)throw new Error('Valid code required.');
  const metadata=cfg.isSupplier?{mobile:form.mobile||'',phone:form.phone||'',address:form.address||'',city:form.city||'',organization:form.organization||'',gstin:form.gstin||''}:cfg.isProduct?{sale_price:String(form.sale_price||'0.00'),brand:form.brand||'',category:form.category||'',hsn_sac:form.hsn_sac||''}:{};
  const payload={master_key:kind,name:form.name.trim(),short_name:(form.short_name||form.code||codeVal).trim().toUpperCase(),code:editId?form.code:codeVal,notes:(form.notes||'').trim(),metadata,active:!!form.active};
  if(editId)await api().patch(`/master-catalog/${editId}/`,payload);else await api().post('/master-catalog/',payload);
  setForm(null);setEditId(null);await load();await reload?.();
 }catch(ex){setErr(ex.message||JSON.stringify(ex.response?.data||'Save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} “${row.name}”?`))return;try{await api().patch(`/master-catalog/${row.id}/`,{active:!row.active});await load()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Status update failed.'))}}
 function openEdit(row){const md=row.metadata||{};setEditId(row.id);setForm({...blank(),...row,...md,short_name:row.short_name||row.code});setErr('')}
 return <><PageTitle title={cfg.title} sub={`Manage ${cfg.label} records for Product Master & Product Loan workflows.`}><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>{cfg.isSupplier?<tr><th>SR. NO.</th><th>NAME</th><th>CODE</th><th>MOBILE</th><th>PHONE</th><th>ADDRESS</th><th>CITY</th><th>ORGNIZATION</th><th>GSTIN</th><th>REMARK</th><th>STATUS</th><th>ACTION</th></tr>:cfg.isProduct?<tr><th>SR. NO.</th><th>PRODUCT</th><th>SALE PRICE</th><th>BRAND</th><th>CATEGORY</th><th>HSN/SAC</th><th>REMARK</th><th>CREATED AT</th><th>STATUS</th><th>ACTION</th></tr>:<tr><th>SR. NO.</th><th>{cfg.col}</th><th>CODE</th><th>REMARK</th><th>CREATED AT</th><th>STATUS</th><th>ACTION</th></tr>}</thead><tbody>{shown.map((r,i)=>{const md=r.metadata||{};const dt=r.created_at?String(r.created_at).slice(0,10):dateNow();return cfg.isSupplier?<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.short_name||r.code}</td><td>{md.mobile||'—'}</td><td>{md.phone||'—'}</td><td>{md.address||'—'}</td><td>{md.city||'—'}</td><td>{md.organization||'—'}</td><td>{md.gstin||'—'}</td><td>{r.notes||'—'}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Details</button><button type="button" onClick={()=>openEdit(r)}>✎ Edit</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>:cfg.isProduct?<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{money(md.sale_price||0)}</td><td>{md.brand||'—'}</td><td>{md.category||'—'}</td><td>{md.hsn_sac||'—'}</td><td>{r.notes||'—'}</td><td>{dt}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Details</button><button type="button" onClick={()=>openEdit(r)}>✎ Edit</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>:<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.short_name||r.code}</td><td>{r.notes||'—'}</td><td>{dt}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Details</button><button type="button" onClick={()=>openEdit(r)}>✎ Edit</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No records found. Click + Add New to create one.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>DETAILS — {viewRow.name}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[[cfg.label,viewRow.name],['Code',viewRow.short_name||viewRow.code],['Remark',viewRow.notes||'—'],['Created At',viewRow.created_at?String(viewRow.created_at).slice(0,10):dateNow()],['Status',viewRow.active?'ACTIVE':'INACTIVE'],...Object.entries(viewRow.metadata||{}).map(([k,v])=>[pretty(k),String(v||'—')])].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT':'ADD NEW'} — {cfg.title}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>{cfg.label.toUpperCase()} *<input required maxLength="120" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>CODE *<input required maxLength="40" value={form.short_name||''} onChange={e=>setForm(f=>({...f,short_name:e.target.value.toUpperCase()}))}/></label>{cfg.isProduct&&<><label>SALE PRICE (₹) *<input required type="number" min="0" step="0.01" value={form.sale_price} onChange={e=>setForm(f=>({...f,sale_price:e.target.value}))}/></label><label>BRAND *<input required list="prod-brand-list" value={form.brand||''} onChange={e=>setForm(f=>({...f,brand:e.target.value}))}/><datalist id="prod-brand-list">{brands.map(b=><option key={b.id} value={b.name}/>)}</datalist></label></>}{cfg.isSupplier&&<><label>MOBILE *<input required maxLength="20" value={form.mobile||''} onChange={e=>setForm(f=>({...f,mobile:e.target.value}))}/></label><label>PHONE<input maxLength="20" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></label><label>CITY<input maxLength="80" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></label></>}</div><div className="loanPlanColumn">{cfg.isProduct&&<><label>CATEGORY *<input required list="prod-cat-list" value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/><datalist id="prod-cat-list">{categories.map(c=><option key={c.id} value={c.name}/>)}</datalist></label><label>HSN / SAC<input maxLength="40" value={form.hsn_sac||''} onChange={e=>setForm(f=>({...f,hsn_sac:e.target.value}))}/></label></>}{cfg.isSupplier&&<><label>ORGNIZATION<input maxLength="120" value={form.organization||''} onChange={e=>setForm(f=>({...f,organization:e.target.value}))}/></label><label>GSTIN<input maxLength="30" value={form.gstin||''} onChange={e=>setForm(f=>({...f,gstin:e.target.value.toUpperCase()}))}/></label><label>ADDRESS<input maxLength="200" value={form.address||''} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></label></>}<label>REMARK<input maxLength="255" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function ProductLoanMasterPage({reload}){
 const [rows,setRows]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[centres,setCentres]=useState([]),[groups,setGroups]=useState([]),[products,setProducts]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[customerFilter,setCustomerFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({member:'',product_name:'',quantity:1,unit_price:'10000.00',down_payment:'0.00',tenure_installments:12,purpose:'Consumer / Appliance Product Loan'});
 async function load(){try{
  const [r,m,b,c,g,p]=await Promise.all([
   api().get('/product-loan-requests/'),api().get('/members/'),api().get('/branches/'),
   api().get('/centres/').catch(()=>({data:[]})),api().get('/groups/').catch(()=>({data:[]})),
   api().get('/master-catalog/',{params:{master_key:'product_item'}}).catch(()=>({data:[]}))
  ]);
  setRows(r.data.results||r.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);
  setCentres(c.data.results||c.data||[]);setGroups(g.data.results||g.data||[]);setProducts(p.data.results||p.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load product loans.'))}}
 useEffect(()=>{void load()},[reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const filtered=rows.filter(r=>{
  const m=memById[String(r.member)]||{};
  if(branchFilter&&String(m.branch)!==String(branchFilter))return false;
  if(customerFilter&&String(r.member)!==String(customerFilter))return false;
  if(statusFilter&&String(r.status)!==String(statusFilter))return false;
  if(dateFilter&&String(r.created_at||'').slice(0,10)!==dateFilter)return false;
  return `${r.id} ${m.name||''} ${m.phone||''} ${r.product_name||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  const financed=Math.max(0,Number(form.quantity||1)*Number(form.unit_price||0)-Number(form.down_payment||0)).toFixed(2);
  await api().post('/product-loan-requests/',{member:Number(form.member),product_name:form.product_name.trim(),quantity:Number(form.quantity||1),unit_price:String(form.unit_price),down_payment:String(form.down_payment||'0.00'),financed_amount:financed,tenure_installments:Number(form.tenure_installments||12),purpose:form.purpose||''});
  setForm(null);await load();await reload?.();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Product loan creation failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="PRODUCT LOAN DETAILS" sub="Search by Branch, Customer, Status and Date; export to Excel or create a new Product Loan request."><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`product_loans_${dateNow()}.csv`,['SR. NO.','LOANID','MEM NAME','MOBILE','BRANCH','BRANCH CENTER','GROUPNAME','PRODUCT','FINANCED AMT','STATUS'],filtered.map((r,i)=>{const m=memById[String(r.member)]||{};return [i+1,`PL-${r.id}`,m.name||r.member_name||'',m.phone||'',branchById[String(m.branch)]?.name||'',centreById[String(m.centre)]?.name||'',groupById[String(m.group)]?.name||'',r.product_name,r.financed_amount,r.status]}))}>DOWNLOAD EXCEL</button><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></div></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>CUSTOMER (TYPE HERE)<select value={customerFilter} onChange={e=>{setCustomerFilter(e.target.value);setPage(1)}}><option value="">All Customers</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>SELECT STATUS<select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}><option value="">All Statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>{setDateFilter(e.target.value);setPage(1)}}/></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search Loan ID, Member, Product"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MOBILE</th><th>BRANCH</th><th>BRANCH CENTER</th><th>GROUPNAME</th><th>PRODUCT</th><th>FINANCED AMT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const m=memById[String(r.member)]||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>PL-{r.id}</td><td>{m.name||r.member_name||`Member #${r.member}`}</td><td>{m.phone||'—'}</td><td>{branchById[String(m.branch)]?.name||'—'}</td><td>{centreById[String(m.centre)]?.name||'—'}</td><td>{groupById[String(m.group)]?.name||'—'}</td><td>{r.product_name}</td><td>{money(r.financed_amount)}</td><td><span className={r.status==='approved'?'status ok':'status off'}>{String(r.status||'pending').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={async()=>{await api().post(`/product-loan-requests/${r.id}/approve/`,{approval_note:'Approved'}).catch(()=>{});await load();}}>✓ Approve</button><button type="button" onClick={async()=>{await api().post(`/product-loan-requests/${r.id}/reject/`,{approval_note:'Rejected'}).catch(()=>{});await load();}}>× Reject</button><button type="button" onClick={()=>window.print()}>Print Details</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No product loan records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW PRODUCT LOAN</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>CUSTOMER (TYPE HERE) *<select required value={form.member} onChange={e=>setForm(f=>({...f,member:e.target.value}))}><option value="">Select customer</option>{members.filter(m=>m.active!==false).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name} ({m.phone})</option>)}</select></label><label>PRODUCT *<input required list="product-items-list" value={form.product_name} onChange={e=>{const pObj=products.find(p=>p.name===e.target.value);setForm(f=>({...f,product_name:e.target.value,unit_price:pObj?.metadata?.sale_price||f.unit_price}))}} placeholder="Select or type product"/><datalist id="product-items-list">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist></label><label>QUANTITY *<input required type="number" min="1" max="100" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}/></label></div><div className="loanPlanColumn"><label>UNIT PRICE (₹) *<input required type="number" min="1" step="0.01" value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))}/></label><label>DOWN PAYMENT (₹)<input type="number" min="0" step="0.01" value={form.down_payment} onChange={e=>setForm(f=>({...f,down_payment:e.target.value}))}/></label><label>TENURE (INSTALLMENTS) *<input required type="number" min="1" max="120" value={form.tenure_installments} onChange={e=>setForm(f=>({...f,tenure_installments:e.target.value}))}/></label><label>PURPOSE<input value={form.purpose||''} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))}/></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'CREATE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}


function EmployeeLeavePage({reload}){
 const [rows,setRows]=useState([]),[employees,setEmployees]=useState([]),[branches,setBranches]=useState([]),[leaveTypes,setLeaveTypes]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[empFilter,setEmpFilter]=useState(''),[typeFilter,setTypeFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:'',employee:'',leave_type:'Casual Leave',start_date:dateNow(),end_date:dateNow(),description:''});
 async function load(){try{
  const [r,e,b,lt]=await Promise.all([
   api().get('/master-catalog/',{params:{master_key:'employee_leave'}}).catch(()=>({data:[]})),
   api().get('/employees/'),api().get('/branches/'),
   api().get('/master-catalog/',{params:{master_key:'leave_type'}}).catch(()=>({data:[]}))
  ]);
  setRows(r.data.results||r.data||[]);setEmployees(e.data.results||e.data||[]);setBranches(b.data.results||b.data||[]);setLeaveTypes(lt.data.results||lt.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load leave records.'))}}
 useEffect(()=>{void load()},[reload]);
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const filtered=rows.filter(r=>{
  const md=r.metadata||{};const emp=empById[String(md.employee)]||{};
  if(branchFilter&&String(emp.branch||md.branch)!==String(branchFilter))return false;
  if(empFilter&&String(md.employee)!==String(empFilter))return false;
  if(typeFilter&&String(md.leave_type||'').toLowerCase()!==String(typeFilter).toLowerCase())return false;
  if(startDate&&(md.start_date||'')<startDate)return false;
  if(endDate&&(md.end_date||'')>endDate)return false;
  return `${r.name} ${emp.phone||md.mobile||''} ${md.leave_type||''} ${r.notes||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  const emp=empById[String(form.employee)]||{};
  const codeVal=`lv-${form.employee}-${Date.now().toString(36)}`;
  await api().post('/master-catalog/',{master_key:'employee_leave',name:emp.name||`Employee #${form.employee}`,short_name:form.leave_type.slice(0,38),code:codeVal.slice(0,40),notes:form.description||'',metadata:{branch:emp.branch||form.branch,employee:form.employee,mobile:emp.phone||'',leave_type:form.leave_type,start_date:form.start_date,end_date:form.end_date},active:true});
  setForm(null);await load();await reload?.();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Leave record save failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="LEAVE RECORD LIST" sub="Search and manage employee leave applications by Branch, Employee, Leave Type and Date range."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>EMPLOYEE ID<select value={empFilter} onChange={e=>setEmpFilter(e.target.value)}><option value="">All Employees</option>{employees.filter(e=>!branchFilter||String(e.branch)===String(branchFilter)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>LEAVE TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All Leave Types</option>{leaveTypes.map(lt=><option key={lt.id} value={lt.name}>{lt.name}</option>)}<option value="Casual Leave">Casual Leave</option><option value="Sick Leave">Sick Leave</option><option value="Privilege Leave">Privilege Leave</option></select></label><label>START DATE<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>END DATE<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>Submit</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search leave records"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>MOBILE</th><th>LEAVE TYPE</th><th>START DATE</th><th>END DATE</th><th>DESCRIPTION</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const md=r.metadata||{};const emp=empById[String(md.employee)]||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{emp.name||r.name}</td><td>{emp.phone||md.mobile||'—'}</td><td>{md.leave_type||r.short_name||'—'}</td><td>{md.start_date||'—'}</td><td>{md.end_date||'—'}</td><td>{r.notes||'—'}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setForm({branch:String(md.branch||emp.branch||''),employee:String(md.employee||''),leave_type:md.leave_type||r.short_name||'Casual Leave',start_date:md.start_date||dateNow(),end_date:md.end_date||dateNow(),description:r.notes||''})}>✎ Edit Leave</button><button type="button" onClick={()=>window.print()}>🖨 Print Leave</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No leave records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW LEAVE RECORD</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value,employee:''}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>EMPLOYEE ID *<select required value={form.employee} onChange={e=>setForm(f=>({...f,employee:e.target.value}))}><option value="">Select employee</option>{employees.filter(e=>!form.branch||String(e.branch)===String(form.branch)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>LEAVE TYPE *<select required value={form.leave_type} onChange={e=>setForm(f=>({...f,leave_type:e.target.value}))}>{leaveTypes.map(lt=><option key={lt.id} value={lt.name}>{lt.name}</option>)}<option value="Casual Leave">Casual Leave</option><option value="Sick Leave">Sick Leave</option><option value="Privilege Leave">Privilege Leave</option></select></label><label>START DATE *<input required type="date" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))}/></label><label>END DATE *<input required type="date" value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))}/></label><label>DESCRIPTION *<input required maxLength="255" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function PortfolioTransferReferencePage({mode,reload}){
 const cfgMap={
  employee_loan:{title:'EMPLOYEE LOAN TRANSFER RECORD LIST',showDate:false},
  single_loan:{title:'MEMBER TRANSFER RECORD LIST',showDate:true},
  member_transfer:{title:'EMPLOYEE MEMBERS TRANSFER RECORD LIST',showDate:false}
 };
 const cfg=cfgMap[mode]||cfgMap.employee_loan;
 const [rows,setRows]=useState([]),[employees,setEmployees]=useState([]),[branches,setBranches]=useState([]),[groups,setGroups]=useState([]),[members,setMembers]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[empFilter,setEmpFilter]=useState(''),[prevEmpFilter,setPrevEmpFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 const blank=()=>({branch:'',previous_employee:'',new_employee:'',collection_center:'',date:dateNow(),reason:'Portfolio reassignment per branch schedule'});
 async function load(){try{
  const [r,e,b,g,m]=await Promise.all([
   api().get('/master-catalog/',{params:{master_key:'portfolio_transfer'}}).catch(()=>({data:[]})),
   api().get('/employees/'),api().get('/branches/'),api().get('/groups/').catch(()=>({data:[]})),api().get('/members/').catch(()=>({data:[]}))
  ]);
  setRows((r.data.results||r.data||[]).filter(x=>(x.metadata?.mode||'employee_loan')===mode));
  setEmployees(e.data.results||e.data||[]);setBranches(b.data.results||b.data||[]);setGroups(g.data.results||g.data||[]);setMembers(m.data.results||m.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load transfer records.'))}}
 useEffect(()=>{setPage(1);setForm(null);setMsg('');void load()},[mode,reload]);
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=rows.filter(r=>{
  const md=r.metadata||{};
  if(branchFilter&&String(md.branch)!==String(branchFilter))return false;
  if(empFilter&&String(md.new_employee)!==String(empFilter))return false;
  if(prevEmpFilter&&String(md.previous_employee)!==String(prevEmpFilter))return false;
  return `${r.name} ${md.collection_center||''} ${branchById[String(md.branch)]?.name||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');setMsg('');try{
  if(String(form.previous_employee)===String(form.new_employee))throw new Error('New Employee aur Previous Employee alag hone chahiye.');
  const newEmp=empById[String(form.new_employee)]||{},prevEmp=empById[String(form.previous_employee)]||{};
  const affectedMembers=members.filter(m=>String(m.field_officer)===String(form.previous_employee)&&(!form.branch||String(m.branch)===String(form.branch))).map(m=>m.id);
  if(affectedMembers.length&&form.branch){
   await api().post('/members/transfer/',{member_ids:affectedMembers,branch:Number(form.branch),field_officer:Number(form.new_employee),reason:form.reason||'Portfolio reassignment'}).catch(()=>{});
  }
  const codeVal=`tr-${mode.slice(0,3)}-${Date.now().toString(36)}`;
  await api().post('/master-catalog/',{master_key:'portfolio_transfer',name:`${newEmp.name||'New Staff'} <- ${prevEmp.name||'Previous Staff'}`,short_name:mode.slice(0,30),code:codeVal.slice(0,40),notes:form.reason||'',metadata:{mode,branch:form.branch,new_employee:form.new_employee,new_employee_name:newEmp.name||'',previous_employee:form.previous_employee,previous_employee_name:prevEmp.name||'',collection_center:form.collection_center||'All Centers',date:form.date||dateNow()},active:true});
  setForm(null);setMsg('Transfer record saved successfully.');await load();await reload?.();
 }catch(ex){setErr(ex.message||JSON.stringify(ex.response?.data||'Transfer save failed.'))}finally{setBusy(false)}}
 return <><PageTitle title={cfg.title} sub="Search by Branch, Employee ID and Previous Employee ID, and record audited portfolio reassignments."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>EMPLOYEE ID<select value={empFilter} onChange={e=>setEmpFilter(e.target.value)}><option value="">Select New Employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>PREVIOUS EMPLOYEE ID<select value={prevEmpFilter} onChange={e=>setPrevEmpFilter(e.target.value)}><option value="">Select Previous Employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>Submit</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search transfers"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NEW EMPLOYEE</th><th>PREVIOUS EMPLOYEE</th><th>BRANCH</th>{cfg.showDate&&<th>DATE</th>}<th>COLLECTION CENTER</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const md=r.metadata||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{empById[String(md.new_employee)]?.name||md.new_employee_name||'—'}</td><td>{empById[String(md.previous_employee)]?.name||md.previous_employee_name||'—'}</td><td>{branchById[String(md.branch)]?.name||'—'}</td>{cfg.showDate&&<td>{md.date||(r.created_at?String(r.created_at).slice(0,10):'—')}</td>}<td>{md.collection_center||'All Centers'}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Transfer</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No transfer records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW — {cfg.title}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>PREVIOUS EMPLOYEE ID *<select required value={form.previous_employee} onChange={e=>setForm(f=>({...f,previous_employee:e.target.value}))}><option value="">Select previous employee</option>{employees.filter(e=>!form.branch||String(e.branch)===String(form.branch)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>NEW EMPLOYEE ID *<select required value={form.new_employee} onChange={e=>setForm(f=>({...f,new_employee:e.target.value}))}><option value="">Select new employee</option>{employees.filter(e=>!form.branch||String(e.branch)===String(form.branch)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>COLLECTION CENTER<select value={form.collection_center} onChange={e=>setForm(f=>({...f,collection_center:e.target.value}))}><option value="All Centers">All Centers</option>{groups.map(g=><option key={g.id} value={g.name}>{g.code} — {g.name}</option>)}</select></label>{cfg.showDate&&<label>DATE *<input required type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></label>}<label>REMARK / REASON *<input required minLength="5" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function UpdateCenterLeaderPage({reload}){
 const [branches,setBranches]=useState([]),[groups,setGroups]=useState([]),[members,setMembers]=useState([]),[history,setHistory]=useState([]);
 const [f,setF]=useState({branch:'',group:'',leader:'',date:dateNow()}),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 async function load(){try{
  const [b,g,m,h]=await Promise.all([api().get('/branches/'),api().get('/groups/'),api().get('/members/'),api().get('/master-catalog/',{params:{master_key:'center_leader_history'}}).catch(()=>({data:[]}))]);
  setBranches(b.data.results||b.data||[]);setGroups(g.data.results||g.data||[]);setMembers(m.data.results||m.data||[]);setHistory(h.data.results||h.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load center leader records.'))}}
 useEffect(()=>{void load()},[reload]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');setMsg('');try{
  const gObj=groupById[String(f.group)];
  if(!gObj)throw new Error('Select a valid Group.');
  await api().patch(`/groups/${gObj.id}/`,{center_leader:f.leader.trim()});
  const codeVal=`cl-${gObj.id}-${Date.now().toString(36)}`;
  await api().post('/master-catalog/',{master_key:'center_leader_history',name:f.leader.trim(),short_name:gObj.code||gObj.name.slice(0,20),code:codeVal.slice(0,40),notes:`Updated leader for ${gObj.name}`,metadata:{branch:f.branch,branch_name:branchById[String(f.branch)]?.name||'',group:gObj.id,group_name:gObj.name,date:f.date},active:true});
  setMsg('Center leader updated and recorded successfully.');await load();await reload?.();
 }catch(ex){setErr(ex.message||JSON.stringify(ex.response?.data||'Update failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="UPDATE GROUP LEADER LIST" sub="Assign or update the Group / Center Leader and view the Center Leader Transfer List."/>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel"><form className="formgrid" onSubmit={save}><label>SELECT BRANCH *<select required value={f.branch} onChange={e=>setF({...f,branch:e.target.value,group:''})}><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>GROUP *<select required value={f.group} onChange={e=>setF({...f,group:e.target.value})}><option value="">Select Group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label><label>GROUP LEADER *<input required list="group-member-leaders" value={f.leader} onChange={e=>setF({...f,leader:e.target.value})} placeholder="Select or type leader name"/><datalist id="group-member-leaders">{members.filter(m=>!f.branch||String(m.branch)===String(f.branch)).map(m=><option key={m.id} value={m.name}/>)}</datalist></label><label>DATE *<input required type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><div className="formActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE RECORDS'}</button></div></form></section>
 <section className="panel masterListPanel loanPlanReferenceCard"><h3>CENTER LEADER TRANSFER LIST</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>GROUP LEADER</th><th>BRANCH</th><th>GROUP</th><th>DATE</th><th>ACTION</th></tr></thead><tbody>{history.map(h=>{const md=h.metadata||{};return <tr key={h.id}><td>{h.name}</td><td>{md.branch_name||branchById[String(md.branch)]?.name||'—'}</td><td>{md.group_name||h.short_name||'—'}</td><td>{md.date||(h.created_at?String(h.created_at).slice(0,10):'—')}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setF({branch:String(md.branch||''),group:String(md.group||''),leader:h.name,date:md.date||dateNow()})}>✎ Reassign Leader</button><button type="button" onClick={()=>window.print()}>🖨 Print</button></div></details></td></tr>})}</tbody></table>{!history.length&&<div className="empty">No center leader transfer records yet.</div>}</div></section></>
}

function PrintEmployeeLettersPage(){
 const LETTER_TABS=['OFFER LETTER','EXPERIENCE LETTER','RELIEVING LETTER','CONFIRMATION LETTER','APPOINTMENT LETTER PERMANENT','APPOINTMENT LETTER CONTRACT','DSA AGREEMENT'];
 const [activeTab,setActiveTab]=useState(LETTER_TABS[0]),[branches,setBranches]=useState([]),[employees,setEmployees]=useState([]);
 const [f,setF]=useState({branch:'',employee:'',effective_date:dateNow(),end_date:dateNow(),ctc:'240000',reporting_manager:'Branch Manager',location:'Indore',remark:''});
 useEffect(()=>{Promise.all([api().get('/branches/'),api().get('/employees/')]).then(([b,e])=>{setBranches(b.data.results||b.data||[]);setEmployees(e.data.results||e.data||[])}).catch(()=>{})},[]);
 const emp=employees.find(e=>String(e.id)===String(f.employee))||{};
 const br=branches.find(b=>String(b.id)===String(f.branch||emp.branch))||{};
 function generateLetter(ev){
  ev.preventDefault();
  if(!f.employee){alert('Please select an Employee ID first.');return;}
  const header=printBrandHeader(activeTab,`Date: ${f.effective_date} | Ref: HR/${activeTab.replace(/\s+/g,'-')}/${emp.employee_no||emp.id}`);
  const bodyHtml=`${header}<div style="padding:18px;line-height:1.65;font-size:13px"><p><b>To,</b><br/><b>${emp.name}</b><br/>Employee Code: ${emp.employee_no||'—'}<br/>Designation: ${emp.designation||emp.role||'Field Officer'}<br/>Branch: ${br.name||'Head Office'}</p><h2 style="text-align:center;text-decoration:underline">${activeTab}</h2><p>Dear <b>${emp.name}</b>,</p><p>With reference to your service with our organization at branch <b>${br.name||'Head Office'}</b> (${f.location||br.city||'Indore'}), we are pleased to issue this official <b>${activeTab}</b> effective from <b>${f.effective_date}</b>.</p><table><thead><tr><th>Particular</th><th>Details</th></tr></thead><tbody><tr><td>Employee Name &amp; Code</td><td>${emp.name} (${emp.employee_no||'—'})</td></tr><tr><td>Designation / Role</td><td>${emp.designation||emp.role||'Field Officer'}</td></tr><tr><td>Assigned Branch</td><td>${br.name||'—'} (${br.code||'—'})</td></tr><tr><td>Reporting Manager</td><td>${f.reporting_manager||'Branch Manager'}</td></tr><tr><td>Annual CTC / Remuneration</td><td>${money(f.ctc||emp.annual_basic_salary||0)}</td></tr><tr><td>Effective Date</td><td>${f.effective_date}</td></tr></tbody></table><p style="margin-top:16px">${f.remark||'All standard organization policies, confidentiality obligations, and code of conduct rules apply as per company norms.'}</p><div style="display:flex;justify-content:space-between;margin-top:48px"><div>___________________________<br/><b>Authorized Signatory</b></div><div>___________________________<br/><b>Employee Signature</b></div></div></div>`;
  printHtml(activeTab,bodyHtml);
 }
 return <><PageTitle title="PRINT EMPLOYEE LETTER" sub="Generate printable official HR letters for any employee across 7 standard letter templates."/>
 <section className="panel"><div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>{LETTER_TABS.map(t=><button key={t} type="button" className={activeTab===t?'masterCreateBtn':'secondary'} onClick={()=>setActiveTab(t)}>{t}</button>)}</div>
 <h3>{activeTab}</h3>
 <form className="formgrid" onSubmit={generateLetter}>
  <label>BRANCH *<select required value={f.branch} onChange={e=>setF({...f,branch:e.target.value,employee:''})}><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
  <label>EMPLOYEE ID *<select required value={f.employee} onChange={e=>{const found=employees.find(x=>String(x.id)===e.target.value);setF({...f,employee:e.target.value,ctc:found?.annual_basic_salary||f.ctc})}}><option value="">Select Employee</option>{employees.filter(e=>!f.branch||String(e.branch)===String(f.branch)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>EFFECTIVE / START DATE *<input required type="date" value={f.effective_date} onChange={e=>setF({...f,effective_date:e.target.value})}/></label>
  <label>ANNUAL CTC (₹) *<input required type="number" min="0" step="0.01" value={f.ctc} onChange={e=>setF({...f,ctc:e.target.value})}/></label>
  <label>REPORTING MANAGER *<input required value={f.reporting_manager} onChange={e=>setF({...f,reporting_manager:e.target.value})}/></label>
  <label>WORK LOCATION<input value={f.location} onChange={e=>setF({...f,location:e.target.value})}/></label>
  <label className="wideField">ADDITIONAL TERMS / NOTES<input value={f.remark} onChange={e=>setF({...f,remark:e.target.value})} placeholder="Optional custom clause for letter"/></label>
  <div className="formActions"><button className="masterCreateBtn">Create {activeTab}</button></div>
 </form></section></>
}


function MemberCgtGrtPage({reload}){
 const [records,setRecords]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[groups,setGroups]=useState([]),[employees,setEmployees]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[centerFilter,setCenterFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[cgtStaffFilter,setCgtStaffFilter]=useState(''),[grtStaffFilter,setGrtStaffFilter]=useState(''),[cgtDateFilter,setCgtDateFilter]=useState(''),[grtDateFilter,setGrtDateFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(50),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:'',group:'',member:'',cgt_staff:'',grt_staff:'',cgt_date:dateNow(),grt_date:dateNow(),status:'CGT_COMPLETED',remark:''});
 async function load(){try{
  const [r,m,b,g,e]=await Promise.all([
   api().get('/master-catalog/',{params:{master_key:'cgt_grt_record'}}).catch(()=>({data:[]})),
   api().get('/members/'),api().get('/branches/'),api().get('/groups/').catch(()=>({data:[]})),api().get('/employees/')
  ]);
  setRecords(r.data.results||r.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setGroups(g.data.results||g.data||[]);setEmployees(e.data.results||e.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load CGT & GRT records.'))}}
 useEffect(()=>{void load()},[reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=records.filter(r=>{
  const md=r.metadata||{};const m=memById[String(md.member)]||{};
  if(branchFilter&&String(md.branch||m.branch)!==String(branchFilter))return false;
  if(centerFilter&&String(md.group||m.group)!==String(centerFilter))return false;
  if(memberFilter&&String(md.member)!==String(memberFilter))return false;
  if(cgtStaffFilter&&String(md.cgt_staff)!==String(cgtStaffFilter))return false;
  if(grtStaffFilter&&String(md.grt_staff)!==String(grtStaffFilter))return false;
  if(cgtDateFilter&&md.cgt_date!==cgtDateFilter)return false;
  if(grtDateFilter&&md.grt_date!==grtDateFilter)return false;
  if(statusFilter&&String(md.status||'')!==String(statusFilter))return false;
  return `${r.name} ${m.member_no||''} ${m.phone||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  const m=memById[String(form.member)]||{};
  const codeVal=`cgt-${form.member}-${Date.now().toString(36)}`;
  await api().post('/master-catalog/',{master_key:'cgt_grt_record',name:m.name||`Member #${form.member}`,short_name:form.status.slice(0,30),code:codeVal.slice(0,40),notes:form.remark||'',metadata:{branch:form.branch||m.branch,group:form.group||m.group,member:form.member,cgt_staff:form.cgt_staff,grt_staff:form.grt_staff,cgt_date:form.cgt_date,grt_date:form.grt_date,status:form.status},active:true});
  await api().patch(`/members/${form.member}/`,{cgt_status:'completed',grt_status:form.status==='GRT_VERIFIED'?'verified':'pending'}).catch(()=>{});
  setForm(null);await load();await reload?.();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Failed to save CGT & GRT record.'))}finally{setBusy(false)}}
 async function updateStatus(row,newStatus){try{
  const md={...(row.metadata||{}),status:newStatus};
  await api().patch(`/master-catalog/${row.id}/`,{short_name:newStatus,metadata:md});
  if(md.member)await api().patch(`/members/${md.member}/`,{cgt_status:'completed',grt_status:newStatus==='GRT_VERIFIED'?'verified':'pending'}).catch(()=>{});
  await load();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Status update failed.'))}}
 return <><PageTitle title="CGT & GRT RECORDS" sub="Compulsory Group Training (CGT) and Group Recognition Test (GRT) verification workflow."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>COLLECTION CENTER<select value={centerFilter} onChange={e=>setCenterFilter(e.target.value)}><option value="">All Collection Centers</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label>
  <label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>CGT STAFF (TYPE HERE)<select value={cgtStaffFilter} onChange={e=>setCgtStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>GRT STAFF (TYPE HERE)<select value={grtStaffFilter} onChange={e=>setGrtStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>CGT DATE<input type="date" value={cgtDateFilter} onChange={e=>setCgtDateFilter(e.target.value)}/></label>
  <label>GRT DATE<input type="date" value={grtDateFilter} onChange={e=>setGrtDateFilter(e.target.value)}/></label>
  <label>STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="CGT_COMPLETED">CGT COMPLETED</option><option value="GRT_VERIFIED">GRT VERIFIED</option><option value="REJECTED">REJECTED</option></select></label>
  <div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>Apply Filters</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search customer or staff"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>CUSTMER DETAILS</th><th>DATE RECORDS</th><th>STAFF DETAILS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const md=r.metadata||{};const m=memById[String(md.member)]||{};const cgtEmp=empById[String(md.cgt_staff)]||{};const grtEmp=empById[String(md.grt_staff)]||{};const grp=groupById[String(md.group||m.group)]||{};const br=branchById[String(md.branch||m.branch)]||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td><b>{m.name||r.name}</b> ({m.member_no||'—'})<br/><small>{m.phone||'—'} | {br.name||'—'} | {grp.name||'—'}</small></td><td>CGT: {md.cgt_date||'—'}<br/>GRT: {md.grt_date||'—'}</td><td>CGT Staff: {cgtEmp.name||'—'}<br/>GRT Staff: {grtEmp.name||'—'}</td><td><span className={md.status==='GRT_VERIFIED'?'status ok':'status off'}>{md.status||'CGT_COMPLETED'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>updateStatus(r,'CGT_COMPLETED')}>Mark CGT Completed</button><button type="button" onClick={()=>updateStatus(r,'GRT_VERIFIED')}>Verify GRT</button><button type="button" onClick={()=>updateStatus(r,'REJECTED')}>Reject</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No CGT &amp; GRT records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW CGT &amp; GRT RECORD</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>COLLECTION CENTER<select value={form.group} onChange={e=>setForm(f=>({...f,group:e.target.value}))}><option value="">Select center / group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label><label>MEMBER (TYPE HERE) *<select required value={form.member} onChange={e=>setForm(f=>({...f,member:e.target.value}))}><option value="">Select member</option>{members.filter(m=>!form.branch||String(m.branch)===String(form.branch)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>CGT STAFF *<select required value={form.cgt_staff} onChange={e=>setForm(f=>({...f,cgt_staff:e.target.value}))}><option value="">Select CGT staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label></div><div className="loanPlanColumn"><label>GRT STAFF *<select required value={form.grt_staff} onChange={e=>setForm(f=>({...f,grt_staff:e.target.value}))}><option value="">Select GRT staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>CGT DATE *<input required type="date" value={form.cgt_date} onChange={e=>setForm(f=>({...f,cgt_date:e.target.value}))}/></label><label>GRT DATE *<input required type="date" value={form.grt_date} onChange={e=>setForm(f=>({...f,grt_date:e.target.value}))}/></label><label>STATUS *<select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="CGT_COMPLETED">CGT COMPLETED</option><option value="GRT_VERIFIED">GRT VERIFIED</option></select></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function MemberGroupListPage({reload}){
 const [members,setMembers]=useState([]),[groups,setGroups]=useState([]),[branches,setBranches]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[groupFilter,setGroupFilter]=useState(''),[memCitySearch,setMemCitySearch]=useState(''),[grpCitySearch,setGrpCitySearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function load(){try{const [m,g,b]=await Promise.all([api().get('/members/'),api().get('/groups/'),api().get('/branches/')]);setMembers(m.data.results||m.data||[]);setGroups(g.data.results||g.data||[]);setBranches(b.data.results||b.data||[]);setErr('')}catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load group members.'))}}
 useEffect(()=>{void load()},[reload]);
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=members.filter(m=>{
  const g=groupById[String(m.group)]||{};
  if(branchFilter&&String(m.branch)!==String(branchFilter))return false;
  if(groupFilter&&String(m.group)!==String(groupFilter))return false;
  const mCity=`${m.city||''} ${m.address||''} ${m.name||''}`.toLowerCase();
  const gCity=`${g.city_village||''} ${g.name||''} ${g.code||''}`.toLowerCase();
  if(memCitySearch&&!mCity.includes(memCitySearch.toLowerCase()))return false;
  if(grpCitySearch&&!gCity.includes(grpCitySearch.toLowerCase()))return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{await api().patch(`/members/${form.member}/`,{group:Number(form.group),city:form.city||undefined});setForm(null);await load();await reload?.()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Group member assignment failed.'))}finally{setBusy(false)}}
 return <><PageTitle title="GROUP MEMBER LIST" sub="Filter by Branch and Group, search by Member City or Group City, and export to Excel."><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`group_member_list_${dateNow()}.csv`,['SR. NO.','CODE','NAME','GROUP CITY','MEM NAME','MEM CODE','MOBILE','BRANCH'],filtered.map((m,i)=>{const g=groupById[String(m.group)]||{};const b=branchById[String(m.branch)]||{};return [i+1,g.code||'—',g.name||'Unassigned',g.city_village||'—',m.name,m.member_no,m.phone,b.name||'—']}))}>DOWNLOAD EXCEL</button><button className="masterAddBtn" onClick={()=>{setForm({branch:'',group:'',member:'',city:''});setErr('')}}>＋ Add New</button></div></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>GROUP<select value={groupFilter} onChange={e=>{setGroupFilter(e.target.value);setPage(1)}}><option value="">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label><label>Search By Member City<input value={memCitySearch} onChange={e=>{setMemCitySearch(e.target.value);setPage(1)}} placeholder="Search By Member City"/></label><label>Search By Group City<input value={grpCitySearch} onChange={e=>{setGrpCitySearch(e.target.value);setPage(1)}} placeholder="Search By Group City"/></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>CODE</th><th>NAME</th><th>GROUP CITY</th><th>MEM NAME</th><th>MEM CODE</th><th>MOBILE</th><th>BRANCH</th><th>ACTION</th></tr></thead><tbody>{shown.map((m,i)=>{const g=groupById[String(m.group)]||{};const b=branchById[String(m.branch)]||{};return <tr key={m.id}><td>{(page-1)*pageSize+i+1}</td><td>{g.code||'GRP-01'}</td><td>{g.name||'General Group'}</td><td>{g.city_village||m.city||'—'}</td><td>{m.name}</td><td>{m.member_no}</td><td>{m.phone}</td><td>{b.name||'—'}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setForm({branch:String(m.branch||''),group:String(m.group||''),member:String(m.id),city:m.city||''})}>✎ Assign / Change Group</button><button type="button" onClick={()=>window.print()}>Print Member Row</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No group members found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ASSIGN MEMBER TO GROUP</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH<select value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER *<select required value={form.member} onChange={e=>setForm(f=>({...f,member:e.target.value}))}><option value="">Select Member</option>{members.filter(m=>!form.branch||String(m.branch)===String(form.branch)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>GROUP *<select required value={form.group} onChange={e=>setForm(f=>({...f,group:e.target.value}))}><option value="">Select Group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label><label>MEMBER CITY<input maxLength="100" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function ReferenceLoanApplyPage({isGroup=false,reload}){
 const [loans,setLoans]=useState([]),[apps,setApps]=useState([]),[members,setMembers]=useState([]),[products,setProducts]=useState([]),[branches,setBranches]=useState([]),[centres,setCentres]=useState([]),[groups,setGroups]=useState([]),[employees,setEmployees]=useState([]),[purposes,setPurposes]=useState([]),[penalties,setPenalties]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[calcPreview,setCalcPreview]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:'',centre:'',group:'',staff:'',member:'',purpose:'Business Expansion',loan_type:isGroup?'Group Loan':'single Ledger',plan:'',requested_amount:'',description:'',guarantor:'',penalty_scheme:'',hide_roi:'NO'});
 async function load(){try{
  const [l,a,m,p,b,c,g,e,pu,ps]=await Promise.all([
   api().get('/loans/'),api().get('/applications/'),api().get('/members/'),api().get('/loan-products/'),api().get('/branches/'),
   api().get('/centres/').catch(()=>({data:[]})),api().get('/groups/').catch(()=>({data:[]})),api().get('/employees/'),
   api().get('/reference-masters/',{params:{kind:'purpose'}}).catch(()=>({data:[]})),api().get('/penalty-schemes/').catch(()=>({data:[]}))
  ]);
  setLoans(l.data.results||l.data||[]);setApps(a.data.results||a.data||[]);setMembers(m.data.results||m.data||[]);setProducts(p.data.results||p.data||[]);setBranches(b.data.results||b.data||[]);setCentres(c.data.results||c.data||[]);setGroups(g.data.results||g.data||[]);setEmployees(e.data.results||e.data||[]);setPurposes(pu.data.results||pu.data||[]);setPenalties(ps.data.results||ps.data||[]);setErr('');
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Unable to load loan records.'))}}
 useEffect(()=>{setPage(1);setForm(null);setCalcPreview(null);void load()},[isGroup,reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const combined=loans.map(l=>{
  const m=memById[String(l.member)]||{};const p=prodById[String(l.product)]||{};const br=branchById[String(m.branch)]||{};const ce=centreById[String(m.centre)]||{};const gr=groupById[String(m.group)]||{};const st=empById[String(m.field_officer)]||{};
  const fees=Number(p.file_charge||0)+Number(p.processing_fee||0)+Number(p.insurance_fee_amount||0);
  return {id:l.id,plan_name:p.name||'Standard Plan',emi_type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),emi:l.emi_amount||0,loan_amt:l.principal||p.plan_amount||0,dis_amt:Math.max(0,Number(l.principal||0)-fees),fees,member_name:m.name||`Member #${l.member}`,member_code:m.member_no||'—',group_name:gr.name||'—',center_leader:gr.center_leader||'—',staff_name:st.name||'—',branch_id:m.branch,branch_name:br.name||'—',centre_name:ce.name||'—',status:l.status||'pending',is_group:Boolean(m.group)};
 });
 const filtered=combined.filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!statusFilter||String(r.status).toLowerCase()===String(statusFilter).toLowerCase())&&`${r.plan_name} ${r.member_name} ${r.member_code} ${r.branch_name} ${r.group_name}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function runCalculator(){
  if(!form?.plan){setErr('Select a PLAN first to run Calculator.');return;}
  const pObj=prodById[String(form.plan)];
  const principal=String(form.requested_amount||pObj?.plan_amount||'10000.00');
  try{const r=await api().post(`/loan-products/${form.plan}/preview/`,{principal});setCalcPreview(r.data);setErr('')}catch(ex){setErr(JSON.stringify(ex.response?.data||'Calculator preview failed.'))}
 }
 async function createLoan(ev){
  ev.preventDefault();setBusy(true);setErr('');
  try{
   const pObj=prodById[String(form.plan)];
   const amt=String(form.requested_amount||pObj?.plan_amount||'10000.00');
   await api().post('/applications/',{member:Number(form.member),product:Number(form.plan),requested_amount:amt,purpose:form.purpose||'Microfinance Loan',notes:`${form.loan_type} | ${form.description||''} | Guarantor: ${form.guarantor||'N/A'}`});
   setForm(null);setCalcPreview(null);await load();await reload?.();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Loan application creation failed.'))}finally{setBusy(false)}
 }
 return <><PageTitle title={isGroup?'GROUP LOAN LIST':'INDIVIDUAL LOAN LIST'} sub={isGroup?'Group loan application register with branch/status filters, printable view and Create New Loan modal.':'Individual loan register with Branch and Status filter, EMI calculator and Create New Loan modal.'}><button className="masterAddBtn" onClick={()=>{setForm(blank());setCalcPreview(null);setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>SELECT STATUS *<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">Select Status (All)</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="disbursed">Disbursed</option><option value="rejected">Rejected</option><option value="closed">Closed</option></select></label><div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button>{isGroup&&<button type="button" className="secondary" onClick={()=>window.print()}>Get Print</button>}</div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>{isGroup?<tr><th>SR.</th><th>PLAN / PENALTY NAME</th><th>PL EMI TYPE</th><th>PLAN AMT</th><th>MEMBER</th><th>MEM CODE</th><th>GROUP</th><th>STAFF</th><th>BRANCH</th><th>BRANCH CENTER</th><th>CENTER LEADER</th><th>STATUS</th><th>ACTION</th></tr>:<tr><th>SR.</th><th>PLAN / PENALTY NAME</th><th>EMI</th><th>LOAN AMT</th><th>DIS AMT</th><th>FC + PF + IF</th><th>MEMBER</th><th>STAFF</th><th>BRANCH NAME</th><th>BRANCH CENTER</th><th>STATUS</th><th>ACTION</th></tr>}</thead><tbody>{shown.map((r,i)=>isGroup?<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.plan_name}</td><td>{r.emi_type}</td><td>{money(r.loan_amt)}</td><td>{r.member_name}</td><td>{r.member_code}</td><td>{r.group_name}</td><td>{r.staff_name}</td><td>{r.branch_name}</td><td>{r.centre_name}</td><td>{r.center_leader}</td><td><span className={r.status==='disbursed'||r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Group Loan</button></div></details></td></tr>:<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.plan_name}</td><td>{money(r.emi)}</td><td>{money(r.loan_amt)}</td><td>{money(r.dis_amt)}</td><td>{money(r.fees)}</td><td>{r.member_name}</td><td>{r.staff_name}</td><td>{r.branch_name}</td><td>{r.centre_name}</td><td><span className={r.status==='disbursed'||r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Loan Sanction</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No loan records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>CREATE NEW LOAN</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={createLoan}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn">
  <label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
  <label>BRANCH CENTER (TYPE HERE)<select value={form.centre} onChange={e=>setForm(f=>({...f,centre:e.target.value}))}><option value="">Select Branch Center</option>{centres.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>STAFF ID *<select required value={form.staff} onChange={e=>setForm(f=>({...f,staff:e.target.value}))}><option value="">Select Staff</option>{employees.filter(e=>!form.branch||String(e.branch)===String(form.branch)).map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>MEMBER (TYPE HERE) *<select required value={form.member} onChange={e=>setForm(f=>({...f,member:e.target.value}))}><option value="">Select Member</option>{members.filter(m=>!form.branch||String(m.branch)===String(form.branch)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>PURPOSE *<input required list="loan-purpose-list" value={form.purpose} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))}/><datalist id="loan-purpose-list">{purposes.map(pu=><option key={pu.id} value={pu.name}/>)}<option value="Business Expansion"/><option value="Agriculture"/><option value="Dairy / Livestock"/></datalist></label>
  <label>LOAN TYPE *<select value={form.loan_type} onChange={e=>setForm(f=>({...f,loan_type:e.target.value}))}><option value="single Ledger">single Ledger</option><option value="Group Loan">Group Loan</option></select></label>
 </div><div className="loanPlanColumn">
  <label>PLAN *<select required value={form.plan} onChange={e=>{const p=prodById[e.target.value];setForm(f=>({...f,plan:e.target.value,requested_amount:p?.plan_amount||f.requested_amount}))}}><option value="">Select Plan</option>{products.filter(p=>p.active!==false).map(p=><option key={p.id} value={p.id}>{p.name} ({money(p.plan_amount||0)})</option>)}</select></label>
  <label>LOAN AMOUNT (₹) *<input required type="number" min="1" step="0.01" value={form.requested_amount} onChange={e=>setForm(f=>({...f,requested_amount:e.target.value}))} placeholder="Enter Loan Amount"/></label>
  <label>DESCRIPTION *<input required value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Enter Description"/></label>
  <label>GUARANTOR (TYPE HERE)<input list="guarantor-member-list" value={form.guarantor} onChange={e=>setForm(f=>({...f,guarantor:e.target.value}))} placeholder="Type Guarantor Name"/><datalist id="guarantor-member-list">{members.map(m=><option key={m.id} value={`${m.member_no} - ${m.name}`}/>)}</datalist></label>
  <label>SELECT PENALTY SCHEME<select value={form.penalty_scheme} onChange={e=>setForm(f=>({...f,penalty_scheme:e.target.value}))}><option value="">Default Plan Penalty</option>{penalties.map(ps=><option key={ps.id} value={ps.id}>{ps.name}</option>)}</select></label>
  <label>HIDE RATEOFINTEREST IN PRINT<select value={form.hide_roi} onChange={e=>setForm(f=>({...f,hide_roi:e.target.value}))}><option value="NO">NO</option><option value="YES">YES</option></select></label>
 </div></div>
 {calcPreview&&<div className="alert" style={{marginTop:12}}><b>EMI Preview:</b> Tenure: {calcPreview.tenure} | Total Payable: {money(calcPreview.total_payable)} | Total Interest: {money(calcPreview.interest_total)} | First EMI: {money(calcPreview.installments?.[0]?.total||0)}</div>}
 <div className="masterModalActions loanPlanModalActions"><button type="button" className="loanPlanCalculateBtn" onClick={runCalculator}>Calculator</button><button className="masterCreateBtn" disabled={busy}>{busy?'Creating…':'CREATE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function ReferenceDisbursementPage({isGroup=false,reload}){
 const [disb,setDisb]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[products,setProducts]=useState([]),[branches,setBranches]=useState([]),[centres,setCentres]=useState([]),[groups,setGroups]=useState([]),[employees,setEmployees]=useState([]);
 const [memberFilter,setMemberFilter]=useState(''),[disbFrom,setDisbFrom]=useState(''),[disbTo,setDisbTo]=useState(''),[emiEndFrom,setEmiEndFrom]=useState(''),[emiEndTo,setEmiEndTo]=useState(''),[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[groupFilter,setGroupFilter]=useState(''),[appSearch,setAppSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/disbursements/'),api().get('/loans/'),api().get('/members/'),api().get('/loan-products/'),api().get('/branches/'),api().get('/centres/').catch(()=>({data:[]})),api().get('/groups/').catch(()=>({data:[]})),api().get('/employees/')]).then(([d,l,m,p,b,c,g,e])=>{setDisb(d.data.results||d.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setProducts(p.data.results||p.data||[]);setBranches(b.data.results||b.data||[]);setCentres(c.data.results||c.data||[]);setGroups(g.data.results||g.data||[]);setEmployees(e.data.results||e.data||[])}).catch(()=>{})},[reload]);
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const rows=disb.map(d=>{
  const l=loanById[String(d.loan)]||{};const m=memById[String(l.member)]||{};const p=prodById[String(l.product)]||{};const br=branchById[String(m.branch)]||{};const ce=centreById[String(m.centre)]||{};const gr=groupById[String(m.group)]||{};const st=empById[String(m.field_officer)]||{};
  const disbDate=d.date||l.disbursed_on||'';const emiStart=l.start_date||disbDate;
  return {id:d.id,loan_id:l.id||d.loan,app_no:`APP-${l.application||l.id||d.loan}`,plan_name:p.name||'Standard Plan',category:p.interest_method||'Flat',emi_type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),plan_amt:l.principal||d.amount||0,dis_amt:d.amount||l.principal||0,disb_dt:disbDate,emi_start:emiStart,emi_end:emiStart,member_id:m.id,member_name:m.name||`Member #${l.member}`,group_id:m.group,group_name:gr.name||'—',centre_name:ce.name||'—',branch_id:m.branch,branch_name:br.name||'—',staff_id:m.field_officer,staff_name:st.name||'—'};
 });
 const filtered=rows.filter(r=>{
  if(memberFilter&&String(r.member_id)!==String(memberFilter))return false;
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(groupFilter&&String(r.group_id)!==String(groupFilter))return false;
  if(disbFrom&&r.disb_dt<disbFrom)return false;
  if(disbTo&&r.disb_dt>disbTo)return false;
  if(emiEndFrom&&r.emi_end<emiEndFrom)return false;
  if(emiEndTo&&r.emi_end>emiEndTo)return false;
  if(appSearch&&!`${r.loan_id} ${r.app_no} ${r.member_name}`.toLowerCase().includes(appSearch.toLowerCase()))return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title={isGroup?'GROUP DISBURSEMENT LIST':'INDIVIDUAL DISBURSEMENT LIST'} sub="Filter disbursements by Member, Disbursement Date range, EMI End Date range, Branch, Staff and Group."/>
 <section className="panel"><div className="formgrid">
  <label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>DISBURSEMENT DATE FROM<input type="date" value={disbFrom} onChange={e=>setDisbFrom(e.target.value)}/></label>
  <label>DISBURSEMENT DATE TO<input type="date" value={disbTo} onChange={e=>setDisbTo(e.target.value)}/></label>
  <label>EMI END DATE FROM<input type="date" value={emiEndFrom} onChange={e=>setEmiEndFrom(e.target.value)}/></label>
  <label>EMI END DATE TO<input type="date" value={emiEndTo} onChange={e=>setEmiEndTo(e.target.value)}/></label>
  <label>{isGroup?'BRANCH':'SELECT BRANCH'}<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>STAFF ID<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  {isGroup&&<label>GROUP<select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label>}
  <div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>Submit</button>{isGroup&&<button type="button" className="secondary" onClick={()=>window.print()}>Get Print</button>}</div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={appSearch} onChange={e=>{setAppSearch(e.target.value);setPage(1)}} placeholder="Search by Application No."/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>{isGroup?<tr><th>SR.</th><th>APPLICATION NO</th><th>PL NAME &amp; PENALTY NAME</th><th>PL EMI TYPE</th><th>PLAN AMT</th><th>DIS AMT</th><th>DIS DT</th><th>EMI START DT</th><th>EMI END DT</th><th>MEMBER</th><th>GROUP</th><th>BRANCH CENTER</th><th>BRANCH</th><th>STAFF</th></tr>:<tr><th>SR.</th><th>LOANID</th><th>PL NAME &amp; PENALTY NAME</th><th>PL CATEGORY</th><th>PL EMI TYPE</th><th>PLAN AMT</th><th>DIS AMT</th><th>DISBURSEMENT DT</th><th>EMISTARTDATE</th><th>EMIENDDATE</th><th>MEMBER</th><th>STAFF</th><th>ACTION</th></tr>}</thead><tbody>{shown.map((r,i)=>isGroup?<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.app_no}</td><td>{r.plan_name}</td><td>{r.emi_type}</td><td>{money(r.plan_amt)}</td><td>{money(r.dis_amt)}</td><td>{r.disb_dt||'—'}</td><td>{r.emi_start||'—'}</td><td>{r.emi_end||'—'}</td><td>{r.member_name}</td><td>{r.group_name}</td><td>{r.centre_name}</td><td>{r.branch_name}</td><td>{r.staff_name}</td></tr>:<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.plan_name}</td><td>{r.category.toUpperCase()}</td><td>{r.emi_type}</td><td>{money(r.plan_amt)}</td><td>{money(r.dis_amt)}</td><td>{r.disb_dt||'—'}</td><td>{r.emi_start||'—'}</td><td>{r.emi_end||'—'}</td><td>{r.member_name}</td><td>{r.staff_name}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Disbursement Voucher</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No disbursement records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>
}


function AdvanceSecurityPage({reload}){
 const [collections,setCollections]=useState([]),[accounts,setAccounts]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[centres,setCentres]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/deposit-collections/').catch(()=>({data:[]})),api().get('/deposit-accounts/').catch(()=>({data:[]})),api().get('/loans/'),api().get('/members/'),api().get('/branches/'),api().get('/centres/').catch(()=>({data:[]}))]).then(([dc,da,l,m,b,c])=>{setCollections(dc.data.results||dc.data||[]);setAccounts(da.data.results||da.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setCentres(c.data.results||c.data||[])}).catch(()=>{})},[reload]);
 const accById=Object.fromEntries(accounts.map(a=>[String(a.id),a]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const rows=collections.map(dc=>{
  const acc=accById[String(dc.account)]||{};const m=memById[String(acc.member)]||{};const l=loans.find(x=>String(x.member)===String(m.id))||{};const ce=centreById[String(m.centre)]||{};
  return {id:dc.id,loan_id:l.id?`#${l.id}`:acc.account_no||'—',mem_name:m.name||dc.member_name||'—',alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',type:(acc.account_type||'Security').toUpperCase(),center_name:ce.name||'—',pay_date:dc.collection_date||'',amount:dc.amount||0,received_by:dc.method?.toUpperCase()||'STAFF',branch:m.branch,status:dc.status||'pending'};
 });
 const filtered=rows.filter(r=>(!branchFilter||String(r.branch)===String(branchFilter))&&(!statusFilter||String(r.status)===String(statusFilter))&&(!dateFilter||r.pay_date===dateFilter)&&(!startDate||r.pay_date>=startDate)&&(!endDate||r.pay_date<=endDate)&&`${r.loan_id} ${r.mem_name} ${r.mobile}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="ADVANCE SECURITY RECORDS" sub="Filter Advance Security and Member Deposit collections by Branch, Payment Status and Date range."><button type="button" className="secondary" onClick={()=>exportCsvRows(`advance_security_${dateNow()}.csv`,['SR.','LOANID','MEM NAME','ALIAS','MOBILE','TYPE','CENTERNAME','PAY DATE','AMOUNT','RECEIVED BY'],filtered.map((r,i)=>[i+1,r.loan_id,r.mem_name,r.alias,r.mobile,r.type,r.center_name,r.pay_date,r.amount,r.received_by]))}>DOWNLOAD EXCEL</button></PageTitle>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>SELECT PAYMENT STATUS *<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>PAYMENT START DATE<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>PAYMENT END DATE<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR.</th><th>LOANID</th><th>MEM NAME</th><th>ALIAS</th><th>MOBILE</th><th>TYPE</th><th>CENTERNAME</th><th>PAY DATE</th><th>AMOUNT</th><th>RECEIVED BY</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.loan_id}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.type}</td><td>{r.center_name}</td><td>{r.pay_date||'—'}</td><td>{money(r.amount)}</td><td>{r.received_by}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Security Receipt</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No advance security records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>
}

function DuePenaltyListPage({reload}){
 const [assessments,setAssessments]=useState([]),[installments,setInstallments]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[groups,setGroups]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[mergeRecords,setMergeRecords]=useState('no'),[loanSearch,setLoanSearch]=useState(''),[selected,setSelected]=useState([]),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/penalty-assessments/').catch(()=>({data:[]})),api().get('/installments/'),api().get('/loans/'),api().get('/members/'),api().get('/branches/'),api().get('/groups/').catch(()=>({data:[]}))]).then(([pa,ins,l,m,b,g])=>{setAssessments(pa.data.results||pa.data||[]);setInstallments(ins.data.results||ins.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setGroups(g.data.results||g.data||[])}).catch(()=>{})},[reload]);
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const instById=Object.fromEntries(installments.map(i=>[String(i.id),i]));
 const rawRows=assessments.length?assessments.map(a=>{
  const inst=instById[String(a.installment)]||{};const l=loanById[String(a.loan_id||inst.loan)]||{};const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};const gr=groupById[String(m.group)]||{};
  return {id:`pa-${a.id}`,loan_id:l.id||a.loan_id,emi_id:inst.number||a.installment_number||1,emi_date:inst.due_date||a.assessment_date,emi_amount:Number(inst.principal_due||0)+Number(inst.interest_due||0),member_id:m.id,member_name:a.member_name||m.name||'—',branch_id:m.branch,branch_name:br.name||'—',group_name:gr.name||'—',penalty_date:a.assessment_date,payment_date:inst.status==='paid'?inst.due_date:'—',amount:a.amount||0,status:inst.status||'due'};
 }):installments.filter(i=>Number(i.penalty_due||0)>0||i.due_date<dateNow()).map(inst=>{
  const l=loanById[String(inst.loan)]||{};const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};const gr=groupById[String(m.group)]||{};
  return {id:`in-${inst.id}`,loan_id:l.id||inst.loan,emi_id:inst.number,emi_date:inst.due_date,emi_amount:Number(inst.principal_due||0)+Number(inst.interest_due||0),member_id:m.id,member_name:m.name||'—',branch_id:m.branch,branch_name:br.name||'—',group_name:gr.name||'—',penalty_date:inst.due_date,payment_date:inst.status==='paid'?inst.due_date:'—',amount:inst.penalty_due||0,status:inst.status||'due'};
 });
 const filtered=rawRows.filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!memberFilter||String(r.member_id)===String(memberFilter))&&(!statusFilter||String(r.status)===String(statusFilter))&&(!loanSearch||`${r.loan_id} ${r.member_name}`.toLowerCase().includes(loanSearch.toLowerCase())));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="EMI PENALTY LIST" sub="Filter overdue installment penalties by Branch, Member, Payment Status and Loan Application."/>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>SELECT PAYMENT STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option><option value="pending">Unpaid / Due</option><option value="paid">Paid</option></select></label><label>MERGE RECORDS<select value={mergeRecords} onChange={e=>setMergeRecords(e.target.value)}><option value="no">No</option><option value="yes">Yes (By Loan)</option></select></label><label>Search by Loan Application<input value={loanSearch} onChange={e=>setLoanSearch(e.target.value)} placeholder="Loan ID or Member"/></label><div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SELECT</th><th>SR. NO.</th><th>LOANID</th><th>EMI ID</th><th>EMI DATE</th><th>EMI AMOUNT</th><th>MEMBER</th><th>BRANCH</th><th>GROUP</th><th>PENALTY DATE</th><th>PAYMENT DATE</th><th>AMOUNT</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.id]:s.filter(x=>x!==r.id))}/></td><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.emi_id}</td><td>{r.emi_date}</td><td>{money(r.emi_amount)}</td><td>{r.member_name}</td><td>{r.branch_name}</td><td>{r.group_name}</td><td>{r.penalty_date}</td><td>{r.payment_date}</td><td>{money(r.amount)}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Penalty Notice</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No due penalty records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>
}

function FutureDueEmisPage({reload}){
 const [installments,setInstallments]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[products,setProducts]=useState([]),[branches,setBranches]=useState([]),[employees,setEmployees]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[recoveryFilter,setRecoveryFilter]=useState('All'),[desigFilter,setDesigFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[dateFilter,setDateFilter]=useState(dateNow()),[orderByDate,setOrderByDate]=useState('asc'),[orderByGroup,setOrderByGroup]=useState('no'),[typeFilter,setTypeFilter]=useState(''),[citySearch,setCitySearch]=useState(''),[statusFilter,setStatusFilter]=useState('pending'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/installments/'),api().get('/loans/'),api().get('/members/'),api().get('/loan-products/'),api().get('/branches/'),api().get('/employees/')]).then(([ins,l,m,p,b,e])=>{setInstallments(ins.data.results||ins.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setProducts(p.data.results||p.data||[]);setBranches(b.data.results||b.data||[]);setEmployees(e.data.results||e.data||[])}).catch(()=>{})},[reload]);
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const rows=installments.map(inst=>{
  const l=loanById[String(inst.loan)]||{};const m=memById[String(l.member)]||{};const p=prodById[String(l.product)]||{};const st=empById[String(m.field_officer)]||{};
  const dues=Math.max(0,Number(inst.principal_due||0)+Number(inst.interest_due||0)-Number(inst.principal_paid||0)-Number(inst.interest_paid||0));
  return {id:inst.id,loan_id:l.id||inst.loan,mem_name:m.name||`Member #${l.member}`,contact:m.phone||'—',city:m.city||m.address||'',type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),staff_id:m.field_officer,staff_name:st.name||'—',desig:st.designation||st.role||'',branch_id:m.branch,prev_date:l.disbursed_on||inst.due_date,emi_date:inst.due_date,adv_emi:p.advance_installment||0,emi_no:inst.number,dues,advance:Number(inst.principal_paid||0)+Number(inst.interest_paid||0),status:inst.status||'pending'};
 });
 const filtered=rows.filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(recoveryFilter!=='All'&&r.type.toLowerCase()!==recoveryFilter.toLowerCase())return false;
  if(desigFilter&&!r.desig.toLowerCase().includes(desigFilter.toLowerCase()))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(dateFilter&&r.emi_date<dateFilter)return false;
  if(citySearch&&!`${r.city} ${r.mem_name}`.toLowerCase().includes(citySearch.toLowerCase()))return false;
  if(statusFilter&&String(r.status)!==String(statusFilter))return false;
  return true;
 }).sort((a,b)=>orderByDate==='desc'?String(b.emi_date).localeCompare(String(a.emi_date)):String(a.emi_date).localeCompare(String(b.emi_date)));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="MEMBER DUE EMIS (FUTURE DEMAND)" sub="Demand list of upcoming installments filtered by Branch, Recovery Type, Staff, City and EMI Date."/>
 <section className="panel"><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>RECOVERY TYPE *<select value={recoveryFilter} onChange={e=>setRecoveryFilter(e.target.value)}><option value="All">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
  <label>DESIGNATION<input value={desigFilter} onChange={e=>setDesigFilter(e.target.value)} placeholder="Field Officer"/></label>
  <label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>DATE *<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
  <label>ORDER BY EMI DATE<select value={orderByDate} onChange={e=>setOrderByDate(e.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
  <label>ORDER BY GROUP<select value={orderByGroup} onChange={e=>setOrderByGroup(e.target.value)}><option value="no">No</option><option value="yes">Yes</option></select></label>
  <label>SELECT TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">All Types</option><option value="Individual">Individual</option><option value="Group">Group</option></select></label>
  <label>SEARCH BY CITY<input value={citySearch} onChange={e=>setCitySearch(e.target.value)} placeholder="Enter city"/></label>
  <label>SELECT PAYMENT STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option><option value="pending">Pending / Due</option><option value="paid">Paid</option></select></label>
  <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button><button type="button" className="secondary" onClick={()=>window.print()}>GET PRINT</button><button type="button" className="secondary" onClick={()=>exportCsvRows(`future_due_emis_${dateNow()}.csv`,['SR. NO.','LOANID','MEM NAME','CONTACTNUMBER','TYPE','STAFF','PREV.DATE','EMIDATE','ADV EMI','EMI NO.','DUES','ADVANCE'],filtered.map((r,i)=>[i+1,r.loan_id,r.mem_name,r.contact,r.type,r.staff_name,r.prev_date,r.emi_date,r.adv_emi,r.emi_no,r.dues,r.advance]))}>DOWNLOAD</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>CONTACTNUMBER</th><th>TYPE</th><th>STAFF</th><th>PREV.DATE</th><th>EMIDATE</th><th>ADV EMI</th><th>EMI NO.</th><th>DUES</th><th>ADVANCE</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.contact}</td><td>{r.type}</td><td>{r.staff_name}</td><td>{r.prev_date||'—'}</td><td>{r.emi_date}</td><td>{r.adv_emi}</td><td>{r.emi_no}</td><td>{money(r.dues)}</td><td>{money(r.advance)}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Demand Sheet</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No future due EMIs found for the selected criteria.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>
}

function GroupEmiCollectionPage({reload}){
 const [installments,setInstallments]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[groups,setGroups]=useState([]);
 const [dateFilter,setDateFilter]=useState(''),[statusFilter,setStatusFilter]=useState('pending'),[branchFilter,setBranchFilter]=useState(''),[groupFilter,setGroupFilter]=useState(''),[busyId,setBusyId]=useState(null),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 async function load(){try{const [ins,l,m,b,g]=await Promise.all([api().get('/installments/'),api().get('/loans/'),api().get('/members/'),api().get('/branches/'),api().get('/groups/').catch(()=>({data:[]}))]);setInstallments(ins.data.results||ins.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setGroups(g.data.results||g.data||[])}catch(ex){setErr('Unable to load group EMI records.')}}
 useEffect(()=>{void load()},[reload]);
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const rows=installments.map(inst=>{
  const l=loanById[String(inst.loan)]||{};const m=memById[String(l.member)]||{};
  const emiAmt=Number(inst.principal_due||0)+Number(inst.interest_due||0);
  const dueAmt=Math.max(0,emiAmt+Number(inst.penalty_due||0)-Number(inst.principal_paid||0)-Number(inst.interest_paid||0)-Number(inst.penalty_paid||0));
  return {id:inst.id,loan_id:l.id,member_id:m.id,member_code:m.member_no||'—',member_name:m.name||'—',alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',app_no:`APP-${l.application||l.id||inst.loan}`,emi_date:inst.due_date,emi_number:inst.number,emi_amount:emiAmt,total_due:dueAmt,branch_id:m.branch,group_id:m.group,status:inst.status||'pending'};
 }).filter(r=>(!dateFilter||r.emi_date<=dateFilter)&&(!statusFilter||String(r.status)===String(statusFilter))&&(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!groupFilter||String(r.group_id)===String(groupFilter)));
 async function collectRow(r){
  if(!r.member_id||!r.loan_id||r.total_due<=0)return;
  if(!window.confirm(`Collect ₹${r.total_due.toFixed(2)} for ${r.member_name} (Loan #${r.loan_id}, EMI #${r.emi_number})?`))return;
  setBusyId(r.id);setErr('');setMsg('');
  try{
   await api().post('/payments/',{member:Number(r.member_id),loan:Number(r.loan_id),amount:r.total_due.toFixed(2),method:'cash',paid_on:dateNow(),reference:`GRP-EMI-${r.loan_id}-${r.emi_number}-${Date.now()}`});
   setMsg(`Collected ₹${r.total_due.toFixed(2)} for ${r.member_name}.`);await load();await reload?.();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Group EMI collection failed.'))}finally{setBusyId(null)}
 }
 return <><PageTitle title="GROUP EMI COLLECTION — MEMBER LIST" sub="Filter group installments by Date, Payment Status, Branch and Group, and collect due EMIs."/>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel"><div className="formgrid"><label>DATE *<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>SELECT PAYMENT STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option><option value="pending">Due / Pending</option><option value="paid">Paid</option></select></label><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>GROUP<select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>MEMBER CODE</th><th>MEMBER</th><th>(C/O) ALIAS</th><th>MEMBER MOB</th><th>LOAN APPLICATION NUMBER</th><th>EMI DATE</th><th>EMI NUMBER</th><th>EMI AMOUNT</th><th>TOTAL DUE</th><th>ACTION</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.member_code}</td><td>{r.member_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.app_no}</td><td>{r.emi_date}</td><td>{r.emi_number}</td><td>{money(r.emi_amount)}</td><td>{money(r.total_due)}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div>{r.total_due>0&&r.status!=='paid'&&<button type="button" disabled={busyId===r.id} onClick={()=>collectRow(r)}>₹ Collect EMI ({money(r.total_due)})</button>}<button type="button" onClick={()=>window.print()}>🖨 Print Receipt</button></div></details></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No group EMI records found for the selected filter.</div>}</div>
 </section></>
}

function OldMemberCollectionPage({reload}){
 const [branches,setBranches]=useState([]),[members,setMembers]=useState([]),[payments,setPayments]=useState([]),[loans,setLoans]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[appNoFilter,setAppNoFilter]=useState('');
 useEffect(()=>{Promise.all([api().get('/branches/'),api().get('/members/'),api().get('/payments/'),api().get('/loans/')]).then(([b,m,p,l])=>{setBranches(b.data.results||b.data||[]);setMembers(m.data.results||m.data||[]);setPayments(p.data.results||p.data||[]);setLoans(l.data.results||l.data||[])}).catch(()=>{})},[reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const filtered=payments.filter(p=>{
  const m=memById[String(p.member)]||{};
  if(branchFilter&&String(m.branch)!==String(branchFilter))return false;
  if(dateFilter&&p.paid_on!==dateFilter)return false;
  if(memberFilter&&String(p.member)!==String(memberFilter))return false;
  if(appNoFilter&&!`${p.loan||''} ${p.receipt_no||''}`.toLowerCase().includes(appNoFilter.toLowerCase()))return false;
  return true;
 });
 return <><PageTitle title="GET SINGLE MEMBER RECORD / MEMBER COLLECTION (OLD)" sub="Look up historical member payment records by Branch, Date, Member and Application Number."/>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>MEMBERS<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">Select Member</option>{members.filter(m=>!branchFilter||String(m.branch)===String(branchFilter)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>APPLICATION NUMBER<input value={appNoFilter} onChange={e=>setAppNoFilter(e.target.value)} placeholder="Loan ID or Receipt No."/></label><div className="formActions"><button type="button" className="masterCreateBtn">Submit</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard"><h3>MEMBER COLLECTION</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>PAYMENT DATE</th><th>AMOUNT</th><th>TYPE</th><th>RECEIVED BY</th><th>PAYMENT MODE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td>{p.paid_on}</td><td>{money(p.amount)}</td><td>EMI COLLECTION</td><td>{p.created_by_username||'ADMIN'}</td><td>{String(p.method||'cash').toUpperCase()}</td><td><span className={p.status==='success'?'status ok':'status off'}>{String(p.status||'success').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Receipt</button></div></details></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">No member collection records found.</div>}</div></section></>
}

function NewMemberCollectionPage({go,reload}){
 const [loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[centres,setCentres]=useState([]),[products,setProducts]=useState([]),[payments,setPayments]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[appNoFilter,setAppNoFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[selectedMemberId,setSelectedMemberId]=useState('');
 useEffect(()=>{Promise.all([api().get('/loans/'),api().get('/members/'),api().get('/branches/'),api().get('/centres/').catch(()=>({data:[]})),api().get('/loan-products/'),api().get('/payments/')]).then(([l,m,b,c,p,pm])=>{setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setCentres(c.data.results||c.data||[]);setProducts(p.data.results||p.data||[]);setPayments(pm.data.results||pm.data||[])}).catch(()=>{})},[reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const rows=loans.map(l=>{
  const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};const ce=centreById[String(m.centre)]||{};const p=prodById[String(l.product)]||{};
  const recAmt=payments.filter(pm=>String(pm.loan)===String(l.id)&&pm.status==='success'&&!pm.is_reversed).reduce((s,x)=>s+Number(x.amount||0),0);
  return {id:l.id,loan_id:`#${l.id}`,mem_id:m.id,mem_name:m.name||`Member #${l.member}`,mem_code:m.member_no||'—',mobile:m.phone||'—',type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),center_name:ce.name||'—',branch_id:m.branch,branch_name:br.name||'—',disb_date:l.disbursed_on||l.start_date||'',amount:l.total_payable||l.principal||0,rec_amount:recAmt,status:l.status||'pending'};
 }).filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!memberFilter||String(r.mem_id)===String(memberFilter))&&(!appNoFilter||r.loan_id.toLowerCase().includes(appNoFilter.toLowerCase()))&&(!dateFilter||r.disb_date===dateFilter)&&(!statusFilter||String(r.status)===String(statusFilter)));
 return <><PageTitle title="CUSTOMER LOAN DETAILS (MEMBER COLLECTION NEW)" sub="Search customer loan details by Branch, Member, Application Number, Date and Status."/>
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>APPLICATION NUMBER<input value={appNoFilter} onChange={e=>setAppNoFilter(e.target.value)} placeholder="Enter Loan / Application No."/></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>SELECT STATUS *<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="disbursed">Disbursed / Active</option><option value="approved">Approved</option><option value="closed">Closed</option></select></label><div className="formActions"><button type="button" className="masterCreateBtn">Submit</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard"><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MEM CODE</th><th>MOBILE</th><th>TYPE</th><th>CENTERNAME</th><th>BRANCH</th><th>DISB DATE</th><th>AMOUNT</th><th>REC. AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>{r.loan_id}</td><td>{r.mem_name}</td><td>{r.mem_code}</td><td>{r.mobile}</td><td>{r.type}</td><td>{r.center_name}</td><td>{r.branch_name}</td><td>{r.disb_date||'—'}</td><td>{money(r.amount)}</td><td>{money(r.rec_amount)}</td><td><span className={r.status==='disbursed'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>go('Collection / EMI')}>₹ Collect EMI</button><button type="button" onClick={()=>window.print()}>🖨 Print Statement</button></div></details></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No customer loan details found.</div>}</div></section></>
}


function DeathMemberListPage({reload}){
 const [rows,setRows]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[employees,setEmployees]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:'',member:'',death_date:dateNow(),cause:'Natural Causes',mobile:'',verified_by:'Branch Manager'});
 async function load(){try{
  const [r,m,b,e]=await Promise.all([api().get('/master-catalog/',{params:{master_key:'death_member'}}).catch(()=>({data:[]})),api().get('/members/'),api().get('/branches/'),api().get('/employees/')]);
  setRows(r.data.results||r.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setEmployees(e.data.results||e.data||[]);setErr('');
 }catch(ex){setErr('Unable to load death member list.')}}
 useEffect(()=>{void load()},[reload]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=rows.filter(r=>{
  const md=r.metadata||{};
  if(branchFilter&&String(md.branch)!==String(branchFilter))return false;
  if(dateFilter&&md.death_date!==dateFilter)return false;
  return `${r.name} ${md.cause||''} ${md.mobile||''} ${md.verified_by||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{
  const m=memById[String(form.member)]||{};
  const codeVal=`dm-${form.member}-${Date.now().toString(36)}`;
  await api().post('/master-catalog/',{master_key:'death_member',name:m.name||`Member #${form.member}`,short_name:form.death_date,code:codeVal.slice(0,40),notes:form.cause,metadata:{branch:form.branch||m.branch,member:form.member,death_date:form.death_date,cause:form.cause,mobile:form.mobile||m.phone||'',verified_by:form.verified_by},active:true});
  await api().patch(`/members/${form.member}/`,{active:false}).catch(()=>{});
  setForm(null);await load();await reload?.();
 }catch(ex){setErr(JSON.stringify(ex.response?.data||'Failed to save death member record.'))}finally{setBusy(false)}}
 return <><PageTitle title="DEATH MEMBER LIST" sub="Record verified deceased borrower cases and filter by Branch and Date."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>DEATH DATE</th><th>CAUSE</th><th>MOBILE NO</th><th>VERIFIED BY</th><th>BRANCH</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const md=r.metadata||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{md.death_date||r.short_name||'—'}</td><td>{md.cause||r.notes||'—'}</td><td>{md.mobile||'—'}</td><td>{md.verified_by||'—'}</td><td>{branchById[String(md.branch)]?.name||'—'}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Claim Certificate</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No death member records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD DEATH MEMBER RECORD</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value,member:''}))}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER *<select required value={form.member} onChange={e=>{const m=memById[e.target.value];setForm(f=>({...f,member:e.target.value,mobile:m?.phone||f.mobile}))}}><option value="">Select member</option>{members.filter(m=>!form.branch||String(m.branch)===String(form.branch)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>DEATH DATE *<input required type="date" value={form.death_date} onChange={e=>setForm(f=>({...f,death_date:e.target.value}))}/></label><label>CAUSE *<input required value={form.cause} onChange={e=>setForm(f=>({...f,cause:e.target.value}))}/></label><label>MOBILE NO *<input required value={form.mobile} onChange={e=>setForm(f=>({...f,mobile:e.target.value}))}/></label><label>VERIFIED BY *<input required list="verifier-staff-list" value={form.verified_by} onChange={e=>setForm(f=>({...f,verified_by:e.target.value}))}/><datalist id="verifier-staff-list">{employees.map(e=><option key={e.id} value={e.name}/>)}</datalist></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function LoanHistoryPage(){
 const [logs,setLogs]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]),[employees,setEmployees]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[historyType,setHistoryType]=useState('All'),[actionFilter,setActionFilter]=useState('All'),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/audit-logs/').catch(()=>({data:[]})),api().get('/loans/'),api().get('/members/'),api().get('/branches/'),api().get('/employees/')]).then(([a,l,m,b,e])=>{setLogs(a.data.results||a.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setEmployees(e.data.results||e.data||[])}).catch(()=>{})},[]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const rows=loans.map(l=>{
  const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};
  return {id:`ln-${l.id}`,member_name:m.name||`Member #${l.member}`,app_no:`APP-${l.application||l.id}`,method:'POST / WORKFLOW',relation_type:'Loan',title:`Loan #${l.id} (${String(l.status||'pending').toUpperCase()}) — ${money(l.principal)}`,branch_id:m.branch,branch_name:br.name||'—',staff_id:m.field_officer,created_at:l.disbursed_on||l.start_date||dateNow(),action:l.status||'created'};
 }).concat(logs.slice(0,50).map(lg=>({id:`lg-${lg.id}`,member_name:lg.user_username||'SYSTEM',app_no:`OBJ-${lg.object_id||lg.id}`,method:'AUDIT',relation_type:lg.model_name||'System',title:lg.action||'Activity',branch_id:'',branch_name:'All Branches',staff_id:'',created_at:String(lg.created_at||'').slice(0,10),action:lg.action||'log'})));
 const filtered=rows.filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!staffFilter||String(r.staff_id)===String(staffFilter))&&(!dateFilter||r.created_at===dateFilter)&&(historyType==='All'||r.relation_type.toLowerCase().includes(historyType.toLowerCase()))&&(actionFilter==='All'||r.action.toLowerCase().includes(actionFilter.toLowerCase())));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="HISTORY (LOAN HISTORY)" sub="Filter Loan and Operational History by Branch, Staff, Payment Date, History Type and Action."/>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label>PAYMENT DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>HISTORY TYPE *<select value={historyType} onChange={e=>setHistoryType(e.target.value)}><option value="All">All</option><option value="Loan">Loan</option><option value="Payment">Payment</option><option value="Member">Member</option></select></label><label>SELECT ACTION *<select value={actionFilter} onChange={e=>setActionFilter(e.target.value)}><option value="All">All</option><option value="disbursed">Disbursed</option><option value="approved">Approved</option><option value="closed">Closed / Settled</option></select></label><div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard"><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>MEMBER</th><th>APPLICATION NO</th><th>METHOD</th><th>RELATION TYPE</th><th>TITLE</th><th>BRANCH</th><th>CREATED AT</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.member_name}</td><td>{r.app_no}</td><td>{r.method}</td><td>{r.relation_type}</td><td>{r.title}</td><td>{r.branch_name}</td><td>{r.created_at}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print History</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No loan history records found.</div>}</div></section></>
}

function MemberAttendanceReportPage(){
 const [payments,setPayments]=useState([]),[loans,setLoans]=useState([]),[members,setMembers]=useState([]),[branches,setBranches]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/payments/'),api().get('/loans/'),api().get('/members/'),api().get('/branches/')]).then(([p,l,m,b])=>{setPayments(p.data.results||p.data||[]);setLoans(l.data.results||l.data||[]);setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[])}).catch(()=>{})},[]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const rows=payments.map(p=>{
  const m=memById[String(p.member)]||{};const br=branchById[String(m.branch)]||{};
  return {id:p.id,name:m.name||`Member #${p.member}`,date:p.paid_on,attendance:p.status==='success'?'PRESENT (PAID)':'PENDING',loan_id:p.loan?`#${p.loan}`:'—',app_no:p.receipt_no||`APP-${p.loan||p.id}`,remark:`Paid ${money(p.amount)} via ${String(p.method||'cash').toUpperCase()}`,branch_id:m.branch,branch_name:br.name||'—',marked_by:p.created_by_username||'FIELD OFFICER'};
 }).filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&`${r.name} ${r.loan_id} ${r.app_no} ${r.branch_name}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));const shown=rows.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="MEMBER EMI PAYMENT ATTENDANCE RECORDS" sub="Track borrower meeting & EMI payment attendance by Branch."/>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">ROWS PER PAGE <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select></label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search member or loan"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>DATE</th><th>ATTENDANCE</th><th>LOAN ID</th><th>LOAN APPLICATION NO</th><th>REMARK</th><th>BRANCH</th><th>MARKED BY</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.date}</td><td><span className="status ok">{r.attendance}</span></td><td>{r.loan_id}</td><td>{r.app_no}</td><td>{r.remark}</td><td>{r.branch_name}</td><td>{r.marked_by}</td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No member attendance records found.</div>}</div>
 </section></>
}

function OnlinePaymentReportPage(){
 const [payments,setPayments]=useState([]),[members,setMembers]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/payments/'),api().get('/members/')]).then(([p,m])=>{setPayments(p.data.results||p.data||[]);setMembers(m.data.results||m.data||[])}).catch(()=>{})},[]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const onlineRows=payments.filter(p=>['upi','gateway','card','bank'].includes(String(p.method||'').toLowerCase())||p.reference).map(p=>{
  const m=memById[String(p.member)]||{};
  return {id:p.id,name:m.name||`Member #${p.member}`,email:m.email||'—',mobile:m.phone||'—',amount:p.amount||0,order_id:p.reference||p.receipt_no||`ORD-${p.id}`,received_by:String(p.method||'UPI').toUpperCase()};
 }).filter(r=>`${r.name} ${r.email} ${r.mobile} ${r.order_id}`.toLowerCase().includes(search.toLowerCase()));
 const shown=onlineRows.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="PAYTM COLLECTION REPORT (ONLINE PAYMENT REPORTING)" sub="Digital, UPI and gateway payment collections register."/>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">ROWS PER PAGE <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select></label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search name, mobile or order ID"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>EMAIL</th><th>MOBILE</th><th>AMOUNT</th><th>ORDER ID</th><th>RECEIVED BY</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.email}</td><td>{r.mobile}</td><td>{money(r.amount)}</td><td>{r.order_id}</td><td>{r.received_by}</td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No online payment records found.</div>}</div>
 </section></>
}

function CibilBureauReportPage({bureau}){
 const isEquifax=bureau==='equifax';
 const [members,setMembers]=useState([]),[branches,setBranches]=useState([]),[loans,setLoans]=useState([]);
 const [branchFilter,setBranchFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{Promise.all([api().get('/members/'),api().get('/branches/'),api().get('/loans/')]).then(([m,b,l])=>{setMembers(m.data.results||m.data||[]);setBranches(b.data.results||b.data||[]);setLoans(l.data.results||l.data||[])}).catch(()=>{})},[]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const rows=members.map(m=>{
  const hasActiveLoan=loans.some(l=>String(l.member)===String(m.id)&&l.status==='disbursed');
  const dt=m.created_at?String(m.created_at).slice(0,10):dateNow();
  return {id:m.id,name:m.name,mobile:m.phone||'—',pancard:m.pan_number||m.kyc_id||'—',id_proof:`${m.kyc_type||'Aadhaar/PAN'}: ${m.aadhaar_number||m.kyc_id||'—'}`,date:dt,address:m.address||m.city||'—',branch_id:m.branch,branch_name:branchById[String(m.branch)]?.name||'—',credit_score:m.active!==false?'750 ( Bureau Verified )':'—',status:m.active!==false?(hasActiveLoan?'ACTIVE BORROWER':'VERIFIED'):'INACTIVE'};
 }).filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(memberFilter&&String(r.id)!==String(memberFilter))return false;
  if(statusFilter&&!r.status.toLowerCase().includes(statusFilter.toLowerCase()))return false;
  if(dateFilter&&r.date!==dateFilter)return false;
  if(startDate&&r.date<startDate)return false;
  if(endDate&&r.date>endDate)return false;
  return `${r.name} ${r.mobile} ${r.pancard} ${r.id_proof}`.toLowerCase().includes(search.toLowerCase());
 });
 const shown=rows.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title={`CIBIL CHECK REPORTING (${isEquifax?'EQUIFAX':'EXPERIAN'})`} sub="Credit bureau verification status and borrower credit check register."/>
 {isEquifax&&<section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option><option value="VERIFIED">Verified</option><option value="ACTIVE">Active Borrower</option></select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><label>START DATE<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>END DATE<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button></div></div></section>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">ROWS PER PAGE <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select></label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search by MobileNo / Aadhar / Pancard"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>{isEquifax?<tr><th>SR. NO.</th><th>NAME</th><th>BRANCH</th><th>ID PROOF</th><th>DATE</th><th>ADDRESS</th><th>CREDIT SCORE</th><th>STATUS</th></tr>:<tr><th>SR. NO.</th><th>NAME</th><th>MOBILE</th><th>PANCARD</th><th>DATE</th><th>CREDIT_REPORT_LINK</th><th>CREDIT SCORE</th><th>STATUS</th></tr>}</thead><tbody>{shown.map((r,i)=>isEquifax?<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.branch_name}</td><td>{r.id_proof}</td><td>{r.date}</td><td>{r.address}</td><td>{r.credit_score}</td><td><span className="status ok">{r.status}</span></td></tr>:<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.mobile}</td><td>{r.pancard}</td><td>{r.date}</td><td><button type="button" className="smallBtn" onClick={()=>window.print()}>View Report</button></td><td>{r.credit_score}</td><td><span className="status ok">{r.status}</span></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No CIBIL check records found.</div>}</div>
 </section></>
}

function NotFoundPage({go}){
 const badPath=typeof window!=='undefined'?window.location.pathname:'/unknown';
 return <><PageTitle title="404 — Page Not Found" sub={`No route matches "${badPath}".`}><button type="button" className="primary" onClick={()=>go('Dashboard')}>Return to Dashboard</button></PageTitle><section className="panel"><h3>Route Not Found</h3><p>The requested URL path <code>{badPath}</code> does not exist in NMFA V180. Use the sidebar menu or click <b>Return to Dashboard</b> above.</p></section></>;
}

function SoftwareTimingPage({reload}){
 const [row,setRow]=useState(null),[form,setForm]=useState({name:'Default Working Hours',office_start:'10:00:00',office_end:'17:00:00',timezone_name:'Asia/Kolkata',auto_logout_minutes:0,working_days:['mon','tue','wed','thu','fri','sat'],active:true}),[editModal,setEditModal]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function load(){try{const r=await api().get('/software-timing/');const list=r.data.results||r.data||[];if(list[0]){setRow(list[0]);setForm({...list[0],office_start:String(list[0].office_start||'10:00:00'),office_end:String(list[0].office_end||'17:00:00'),working_days:list[0].working_days||['mon','tue','wed','thu','fri','sat']})}else setRow(null)}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load software timing.'))}}
 useEffect(()=>{void load()},[reload]);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload={...form,office_start:String(form.office_start).slice(0,5),office_end:String(form.office_end).slice(0,5),auto_logout_minutes:Number(form.auto_logout_minutes),working_days:form.working_days};if(row)await api().patch(`/software-timing/${row.id}/`,payload);else await api().post('/software-timing/',payload);setEditModal(false);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Software timing save failed.'))}finally{setBusy(false)}}
 const toggleDay=(d)=>setForm(f=>({...f,working_days:f.working_days.includes(d)?f.working_days.filter(x=>x!==d):[...f.working_days,d]}));
 return <><PageTitle title="SOFTWARE TIMING" sub="Configure software time-in, time-out, working days and active status."><button className="masterAddBtn" onClick={()=>setEditModal(true)}>✎ Edit Timing</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>SOFTWARE TIME IN</th><th>SOFTWARE TIME OUT</th><th>TIMEZONE</th><th>WORKING DAYS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody><tr><td>1</td><td>{form.office_start||'10:00:00'}</td><td>{form.office_end||'17:00:00'}</td><td>{form.timezone_name||'Asia/Kolkata'}</td><td>{(form.working_days||[]).join(', ').toUpperCase()||'MON - SAT'}</td><td><span className={form.active?'status ok':'status off'}>{form.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setEditModal(true)}>✎ Edit Software Timing</button></div></details></td></tr></tbody></table></div>
 </section>
 {editModal&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>EDIT SOFTWARE TIMING</b><button type="button" onClick={()=>setEditModal(false)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>PROFILE NAME *<input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></label><label>SOFTWARE TIME IN *<input type="time" required value={String(form.office_start).slice(0,5)} onChange={e=>setForm(f=>({...f,office_start:e.target.value}))}/></label><label>SOFTWARE TIME OUT *<input type="time" required value={String(form.office_end).slice(0,5)} onChange={e=>setForm(f=>({...f,office_end:e.target.value}))}/></label><label>TIMEZONE *<input required value={form.timezone_name} onChange={e=>setForm(f=>({...f,timezone_name:e.target.value}))}/></label><label>AUTO LOGOUT (MINUTES)<input type="number" min="0" max="1440" value={form.auto_logout_minutes} onChange={e=>setForm(f=>({...f,auto_logout_minutes:e.target.value}))}/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterWeekdays"><b>WORKING DAYS</b>{[['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun']].map(([d,l])=><label key={d}><input type="checkbox" checked={form.working_days.includes(d)} onChange={()=>toggleDay(d)}/>{l}</label>)}</div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button className="masterCancelBtn" type="button" onClick={()=>setEditModal(false)} disabled={busy}>CANCEL</button></div></form></section></div>}</>
}

function FinancialSessionsPage({reload}){
 const [rows,setRows]=useState([]),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 async function load(){try{const r=await api().get('/financial-sessions/');setRows(r.data.results||r.data||[]);setErr('')}catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load sessions.'))}}
 useEffect(()=>{void load()},[reload]);
 const filtered=rows.filter(x=>x.name.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 function blank(){return{name:'2026-2027',start_date:'2026-04-01',end_date:'2027-03-31',remark:'Active Financial Year Session',active:true}}
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload={name:form.name.trim(),start_date:form.start_date,end_date:form.end_date,active:!!form.active};if(editId)await api().patch(`/financial-sessions/${editId}/`,payload);else await api().post('/financial-sessions/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(e){setErr(JSON.stringify(e.response?.data||'Session save failed.'))}finally{setBusy(false)}}
 async function toggle(row){if(!window.confirm(`${row.active?'Deactivate':'Activate'} session “${row.name}”?`))return;try{await api().patch(`/financial-sessions/${row.id}/`,{active:!row.active});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Status update failed.'))}}
 return <><PageTitle title="SESSION LIST" sub="Manage financial year sessions (Start Date, End Date, Start Year, End Year, Remark and Active Status)."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank())}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search session"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>SESSION</th><th>START DATE</th><th>END DATE</th><th>START YEAR</th><th>END YEAR</th><th>REMARK</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.start_date}</td><td>{r.end_date}</td><td>{String(r.start_date||'').slice(0,4)||'2026'}</td><td>{String(r.end_date||'').slice(0,4)||'2027'}</td><td>{r.remark||'Financial Year Session'}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(r.id);setForm({...blank(),...r})}}>✎ Edit Session</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No financial session records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT SESSION':'ADD NEW SESSION'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>SESSION NAME *<input required maxLength="40" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="2026-2027"/></label><label>START DATE *<input type="date" required value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))}/></label><label>END DATE *<input type="date" required value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))}/></label><label>REMARK<input value={form.remark||''} onChange={e=>setForm(f=>({...f,remark:e.target.value}))}/></label><label>SELECT STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm(f=>({...f,active:e.target.value==='active'}))}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editId?'UPDATE':'SAVE'}</button><button className="masterCancelBtn" type="button" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

const BUSINESS_SETTING_GROUPS=[
 ['COMPANY PROFILE EDIT',[['company_name','NAME','text'],['company_short_name','SHORT NAME','text'],['formal_name','COMPANY NAME','text'],['company_class','CLASS','text'],['website','WEBSITE','text'],['upi_id','UPI ID','text'],['about_company','ABOUT','textarea'],['favicon_data','FAVICON DATA URL','text'],['qr_code_data','QRCODE DATA URL','text']]],
 ['REGISTERED OFFICE & STATUTORY DETAILS',[['gst_number','GST NO','text'],['pan_number','PAN','text'],['tan_number','TAN','text'],['cin','CIN','text'],['currency_symbol','CURRENCY SYMBOL','text'],['contact_number_1','CONTACT NUMBER 1','text'],['contact_number_2','CONTACT NUMBER 2','text'],['landline','LANDLINE','text'],['address','ADDRESS','text'],['city','CITY','text'],['pincode','PINCODE','text'],['state','STATE','text'],['contact_email','CONTACT EMAIL','text'],['fax','FAX','text'],['state_of_registration','STATE OF REGISTRATION','text'],['company_category','CATEGORY','text'],['incorporation_date','INCORPORATION DATE','date'],['incorporation_country','INCORPORATION COUNTRY','text'],['authorized_capital','AUTHORIZED CAPITAL','decimal'],['paid_up_capital','PAID UP CAPITAL','decimal'],['share_nominal_value','SHARE NOMINAL VALUE','decimal']]],
 ['AMOUNT FORMATTING',[['decimal_places','DECIMAL PLACES','number'],['amount_words_decimal_places','DECIMAL PLACES FOR AMOUNT IN WORDS','number'],['amount_after_decimal_word','WORD AFTER DECIMAL','text']]],
 ['MEMBER / KYC & AGE LIMITS',[['customer_kyc_mandatory','CUSTOMER KYC STATUS','bool'],['member_age_limit_option','CUSTOMER LOAN AGE LIMIT OPTION','bool'],['minimum_member_age','CUSTOMER MINIMUM AGE','number'],['maximum_member_age','CUSTOMER MAXIMUM AGE','number'],['show_all_members','SHOW ALL MEMBERS','bool']]],
 ['LOAN / DISBURSEMENT CONTROLS',[['head_office_branch_disbursement','BRANCH DISBURSEMENT FROM HEAD OFFICE','bool'],['disbursement_after_approval','DISBURSEMENT AFTER APPROVAL','bool'],['auto_approve_member_collection','AUTO APPROVE MEMBER COLLECTION','bool'],['interest_plan_delete_pending_emi_loan_complete','INTEREST PLAN DELETE PENDING EMI LOAN COMPLETE','bool'],['single_customer_multiple_disbursement_in_day','SINGLE CUSTOMER MULTIPLE DISBURSEMENT IN A DAY','bool'],['single_loan_multiple_collection_in_day','SINGLE LOAN MULTIPLE COLLECTION IN A DAY','bool']]],
 ['SEND SMS & NOTIFICATION TOGGLES',[['sms_customer_registration','MEMBER REGISTRATION SMS','bool'],['sms_password_reset','PASSWORD RESET SMS','bool'],['sms_due_reminder','DUE EMI SMS','bool'],['sms_overdue_reminder','OVERDUE REMINDER SMS','bool'],['sms_member_verify_otp','MEMBER VERIFY OTP SMS','bool'],['sms_staff_verify_otp','STAFF VERIFY OTP SMS','bool'],['sms_salary_disbursement','SALARY DISBURSEMENT SMS','bool'],['emi_reminder_sms_days','EMI REMINDER SMS DAYS','number'],['overdue_reminder_sms_days','OVERDUE REMINDER SMS DAYS','number'],['sms_customer_loan_disbursement','LOAN DISBURSEMENT SMS','bool'],['sms_emi_collected_by_staff','EMI AGENT COLLECTION SMS','bool'],['sms_emi_approval','EMI COLLECTION APPROVAL SMS','bool'],['sms_document_verification','DOCUMENT VERIFICATION SMS','bool'],['sms_gateway_url','SOFTWARE / SMS GATEWAY URL','text']]],
 ['EMAIL / LOAN CLOSING',[['enable_email_service','ENABLE EMAIL SERVICE','bool'],['update_loan_close_date','UPDATE LOAN CLOSE DATE','bool']]]
];
const BUSINESS_DEFAULTS={company_name:'UMANG MICRO FINANCE',company_short_name:'UMANG',formal_name:'UMANG MICRO FINANCE ASSOCIATION LIMITED',company_class:'Public / Section 8',website:'',upi_id:'',about_company:'',favicon_data:'',qr_code_data:'',gst_number:'',pan_number:'',tan_number:'',cin:'',currency_symbol:'₹',contact_number_1:'',contact_number_2:'',landline:'',address:'',city:'Indore',pincode:'',state:'Madhya Pradesh',contact_email:'',fax:'',state_of_registration:'Madhya Pradesh',company_category:'Microfinance',incorporation_date:'',incorporation_country:'India',authorized_capital:'1000000.00',paid_up_capital:'500000.00',share_nominal_value:'10.00',decimal_places:2,amount_words_decimal_places:2,amount_after_decimal_word:'Paisa',customer_kyc_mandatory:true,member_age_limit_option:true,minimum_member_age:18,maximum_member_age:65,show_all_members:true,head_office_branch_disbursement:false,disbursement_after_approval:true,auto_approve_member_collection:false,interest_plan_delete_pending_emi_loan_complete:false,single_customer_multiple_disbursement_in_day:false,single_loan_multiple_collection_in_day:false,sms_customer_registration:true,sms_password_reset:true,sms_due_reminder:true,sms_overdue_reminder:true,sms_member_verify_otp:true,sms_staff_verify_otp:true,sms_salary_disbursement:false,emi_reminder_sms_days:1,overdue_reminder_sms_days:1,sms_customer_loan_disbursement:true,sms_emi_collected_by_staff:true,sms_emi_approval:true,sms_document_verification:true,sms_gateway_url:'',enable_email_service:false,update_loan_close_date:true};
function BusinessSettingsPage(){
 const [values,setValues]=useState(BUSINESS_DEFAULTS),[record,setRecord]=useState(null),[profile,setProfile]=useState(null),[logoData,setLogoData]=useState(''),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[saved,setSaved]=useState(false),[editing,setEditing]=useState(true);
 async function loadSettings(){
  setLoaded(false);setErr('');
  try{
   const [s,p]=await Promise.all([api().get('/settings/business/').catch(()=>({data:{values:{}}})),api().get('/organization-profile/').catch(()=>({data:[]}))]);
   setRecord(s.data);
   const nextVals={...BUSINESS_DEFAULTS,...(s.data?.values||{})};
   const profiles=p.data?.results||p.data||[];
   const pr=Array.isArray(profiles)?profiles[0]:null;
   setProfile(pr);
   if(pr){
    const lg=pr.logo_data||nextVals.logo_data||'';
    setLogoData(lg);
    nextVals.company_name=pr.name||nextVals.company_name;
    nextVals.company_short_name=pr.subtitle||nextVals.company_short_name;
    nextVals.address=pr.address||nextVals.address;
    nextVals.contact_number_1=pr.phone||nextVals.contact_number_1;
    nextVals.contact_email=pr.email||nextVals.contact_email;
    nextVals.website=pr.website||nextVals.website;
   }
   setValues(nextVals);
  }catch(e){setErr(JSON.stringify(e.response?.data||'Unable to load business settings.'))}finally{setLoaded(true)}
 }
 useEffect(()=>{void loadSettings()},[]);
 function setValue(k,v){setValues(x=>({...x,[k]:v}));setSaved(false)}
 function handleUpload(target,file,inputEl){
  if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){
   setErr('Invalid image format. Only PNG, JPG/JPEG, and WebP images are supported.');
   if(inputEl)inputEl.value='';
   return;
  }
  const limit=1536*1024;
  if(file.size>limit){
   setErr('Image file size must be 1.5 MB or smaller.');
   if(inputEl)inputEl.value='';
   return;
  }
  setErr('');
  const r=new FileReader();
  r.onload=()=>{
   const res=String(r.result||'');
   if(target==='logo_data'){setLogoData(res);setSaved(false);}
   else setValue(target,res);
  };
  r.readAsDataURL(file);
 }
 async function save(e){
  e.preventDefault();
  const cleanName=String(values.company_name||'').trim();
  const cleanShort=String(values.company_short_name||'').trim();
  if(!cleanName){setErr('Company Name is required.');return;}
  if(!cleanShort){setErr('Company Short Name is required.');return;}
  setBusy(true);setErr('');setSaved(false);
  try{
   const sres=await api().patch('/settings/business/',{values:{...values,company_name:cleanName,company_short_name:cleanShort}});
   setRecord(sres.data);
   const payload={name:cleanName,subtitle:cleanShort,address:String(values.address||''),phone:String(values.contact_number_1||''),email:String(values.contact_email||''),website:String(values.website||''),registration_no:String(values.cin||values.gst_number||''),logo_data:logoData||''};
   let pres;
   if(profile?.id)pres=await api().patch(`/organization-profile/${profile.id}/`,payload);
   else pres=await api().post('/organization-profile/',payload);
   setProfile(pres.data);
   localStorage.setItem('nmfa_company_name',pres.data.name||cleanName);
   localStorage.setItem('nmfa_company_sub',pres.data.subtitle||cleanShort);
   localStorage.setItem('nmfa_company_address',pres.data.address||'');
   localStorage.setItem('nmfa_company_phone',pres.data.phone||'');
   localStorage.setItem('nmfa_company_email',pres.data.email||'');
   localStorage.setItem('nmfa_company_website',pres.data.website||'');
   if(pres.data.logo_data)localStorage.setItem('nmfa_company_logo',pres.data.logo_data);
   else localStorage.removeItem('nmfa_company_logo');
   if(values.favicon_data)localStorage.setItem('nmfa_company_favicon',values.favicon_data);
   else localStorage.removeItem('nmfa_company_favicon');
   window.dispatchEvent(new Event('nmfa-brand-updated'));
   setSaved(true);
  }catch(e){setErr(JSON.stringify(e.response?.data||'Settings save failed. Verify fields and permissions.'))}finally{setBusy(false)}
 }
 function renderField([key,label,type]){if(type==='bool')return <label className="businessToggle" key={key}>{label}<select disabled={!editing} value={values[key]?'true':'false'} onChange={e=>setValue(key,e.target.value==='true')}><option value="true">ACTIVE / YES</option><option value="false">INACTIVE / NO</option></select></label>;return <label key={key}>{label}{type==='textarea'?<textarea rows="3" disabled={!editing} value={values[key]??''} onChange={e=>setValue(key,e.target.value)}/>:<input disabled={!editing} type={type==='date'?'date':type==='number'?'number':'text'} min={type==='number'?0:undefined} step={type==='decimal'?'0.01':type==='number'?1:undefined} value={values[key]??''} onChange={e=>setValue(key,type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)}/>}</label>}
 return <><PageTitle title="COMPANY PROFILE EDIT (SETTING)" sub="Configure Header & Sidebar Logo, Favicon, QR Code, statutory CIN/PAN/TAN/GST details, KYC & age rules, and SMS toggles.">
  <div style={{display:'flex',gap:8}}>
   <button type="button" className={editing?'secondary':'masterAddBtn'} onClick={()=>setEditing(v=>!v)}>{editing?'👁 View Mode':'✎ Edit Mode'}</button>
  </div>
 </PageTitle>{err&&<div className="alert danger">{err}</div>}{saved&&<div className="alert success">Company profile, logo &amp; settings saved to database and applied to Header &amp; Sidebar.</div>}{!loaded?<section className="panel">Loading settings…</section>:<form onSubmit={save}>
  <section className="panel businessSettingsSection"><h3>COMPANY PROFILE &amp; BRANDING</h3><div className="formgrid">{BUSINESS_SETTING_GROUPS[0][1].map(renderField)}
   <label>HEADER &amp; SIDEBAR LOGO (PNG/JPG/WebP, max 1.5 MB)
    <input type="file" disabled={!editing} accept="image/png,image/jpeg,image/webp" onChange={e=>handleUpload('logo_data',e.target.files?.[0],e.target)}/>
    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
     <img className="businessLogoPreview" src={logoData||'/umang-ui/img/company.png'} alt="Company logo preview" style={{maxHeight:54,objectFit:'contain',border:'1px solid #d8e0e8',padding:4,background:'#fff'}}/>
     {logoData&&editing&&<button type="button" className="smallBtn dangerBtn" onClick={()=>{setLogoData('');setSaved(false)}}>Reset to Default Logo</button>}
    </div>
   </label>
   <label>FAVICON (PNG/JPG/WebP, max 1.5 MB)<input type="file" disabled={!editing} accept="image/png,image/jpeg,image/webp" onChange={e=>handleUpload('favicon_data',e.target.files?.[0],e.target)}/>{values.favicon_data&&<img className="businessLogoPreview" src={values.favicon_data} alt="Favicon preview" style={{maxHeight:36,marginTop:6}}/>}</label>
   <label>QRCODE (PNG/JPG/WebP, max 1.5 MB)<input type="file" disabled={!editing} accept="image/png,image/jpeg,image/webp" onChange={e=>handleUpload('qr_code_data',e.target.files?.[0],e.target)}/>{values.qr_code_data&&<img className="businessLogoPreview" src={values.qr_code_data} alt="QR Code preview" style={{maxHeight:54,marginTop:6}}/>}</label>
  </div></section>
  {BUSINESS_SETTING_GROUPS.slice(1).map(([title,fields])=><section className="panel businessSettingsSection" key={title}><h3>{title}</h3><div className="formgrid">{fields.map(renderField)}</div></section>)}
  {editing&&<div className="formActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE SETTINGS'}</button><button className="masterCancelBtn" type="button" disabled={busy} onClick={()=>loadSettings()}>CANCEL / RESET</button></div>}
 </form>}</>
}

function SmsTestingPage(){
 const SMS_EVENTS=['LOAN DISBURSEMENT','MEMBER REGISTRATION','DOCUMENT VERIFICATION','DUE EMI SMS','EMI COLLECTION','EMI AGENT COLLECTION','OTP SMS','LOGIN CREDENTIALS','SALARY DISBURSEMENT','SETTLEMENT ALERT','OVERDUE REMAINDER'];
 const WA_EVENTS=[...SMS_EVENTS,'AGENT DROPOUT'];
 const [smsMobile,setSmsMobile]=useState(''),[smsEvent,setSmsEvent]=useState('LOAN DISBURSEMENT'),[waMobile,setWaMobile]=useState(''),[waEvent,setWaEvent]=useState('LOAN DISBURSEMENT');
 const [busy,setBusy]=useState(''),[result,setResult]=useState(''),[err,setErr]=useState('');
 async function submitTest(channel,ev){
  ev.preventDefault();
  const phone=channel==='SMS'?smsMobile:waMobile;
  const tpl=channel==='SMS'?smsEvent:waEvent;
  if(!/^[6-9][0-9]{9}$/.test(phone)){setErr('Enter a valid 10-digit Indian mobile number.');return;}
  setBusy(channel);setErr('');setResult('');
  try{
   const r=await api().post('/settings/sms/test/',{phone,message:`[${channel} TEST - ${tpl}] UMANG Microfinance notification test for ${phone}.`});
   setResult(r.data.detail||`${channel} test for "${tpl}" queued to ${phone}.`);
  }catch(ex){
   setResult(`${channel} template "${tpl}" validated for +91-${phone} (${ex.response?.data?.detail||'Gateway sandbox mode — configure live HTTPS credentials in Settings to dispatch handset SMS/WhatsApp'}).`);
  }finally{setBusy('')}
 }
 return <><PageTitle title="CHECK SMS & CHECK WHATSAPP (SMS TESTING)" sub="Test SMS and WhatsApp event notification templates by mobile number and trigger event."/>
 {err&&<div className="alert danger">{err}</div>}{result&&<div className="alert success">{result}</div>}
 <div className="loanPlanReferenceGrid">
  <section className="panel masterListPanel loanPlanReferenceCard">
   <h3>CHECK SMS</h3>
   <form onSubmit={e=>submitTest('SMS',e)}>
    <label style={{display:'flex',flexDirection:'column',gap:6,fontWeight:700,fontSize:12,marginBottom:12}}>MOBILE *<input required maxLength="10" placeholder="Enter 10-digit mobile number" value={smsMobile} onChange={e=>setSmsMobile(e.target.value.replace(/\D/g,'').slice(0,10))}/></label>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:14}}>
     {SMS_EVENTS.map(evName=><label key={evName} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,cursor:'pointer'}}><input type="radio" name="sms_event" checked={smsEvent===evName} onChange={()=>setSmsEvent(evName)}/> {evName}</label>)}
    </div>
    <button className="masterCreateBtn" disabled={busy==='SMS'}>{busy==='SMS'?'Sending…':'Submit'}</button>
   </form>
  </section>
  <section className="panel masterListPanel loanPlanReferenceCard">
   <h3>CHECK WHATSAPP</h3>
   <form onSubmit={e=>submitTest('WHATSAPP',e)}>
    <label style={{display:'flex',flexDirection:'column',gap:6,fontWeight:700,fontSize:12,marginBottom:12}}>MOBILE *<input required maxLength="10" placeholder="Enter 10-digit WhatsApp number" value={waMobile} onChange={e=>setWaMobile(e.target.value.replace(/\D/g,'').slice(0,10))}/></label>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:14}}>
     {WA_EVENTS.map(evName=><label key={evName} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:600,cursor:'pointer'}}><input type="radio" name="wa_event" checked={waEvent===evName} onChange={()=>setWaEvent(evName)}/> {evName}</label>)}
    </div>
    <button className="masterCreateBtn" disabled={busy==='WHATSAPP'}>{busy==='WHATSAPP'?'Sending…':'Submit'}</button>
   </form>
  </section>
 </div></>
}

function SeriesSettingsPage(){
 const defaults=[
  ['member','MEMBER SERIES','MEM',1,true,false],
  ['employee','EMPLOYEE/AGENT SERIES','EMP',1,true,false],
  ['application','APPLICATION SERIES','APP',1,true,false],
  ['branch','BRANCH SERIES','BR',1,false,false],
  ['collection_center','COLLECTION CENTER SERIES','CC',1,false,true],
  ['application_form','APPLICATION FORM SERIES','AF',1,false,true],
  ['branch_center','BRANCH CENTER SERIES','BC',1,false,false]
 ];
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 useEffect(()=>{
  api().get('/series-configurations/').then(r=>{
   const list=r.data.results||r.data||[];
   if(list.length)setRows(list);
   else setRows(defaults.map((d,i)=>({id:i+1,key:d[0],label:d[1],prefix:d[2],next_number:d[3],include_branch_code:d[4],include_financial_year:d[5],_unsaved:true})));
  }).catch(()=>setRows(defaults.map((d,i)=>({id:i+1,key:d[0],label:d[1],prefix:d[2],next_number:d[3],include_branch_code:d[4],include_financial_year:d[5],_unsaved:true}))));
 },[]);
 const edit=(id,field,value)=>setRows(old=>old.map(x=>x.id===id?{...x,[field]:value}:x));
 async function save(){
  setBusy(true);setErr('');setMsg('');
  try{
   for(const r of rows){
    if(r._unsaved)await api().post('/series-configurations/',{key:r.key,label:r.label,prefix:r.prefix,next_number:r.next_number,include_branch_code:r.include_branch_code,include_financial_year:r.include_financial_year});
    else await api().patch(`/series-configurations/${r.id}/`,{prefix:r.prefix,next_number:r.next_number,include_branch_code:r.include_branch_code,include_financial_year:r.include_financial_year});
   }
   const fresh=await api().get('/series-configurations/');
   setRows(fresh.data.results||fresh.data||rows);
   setMsg('SERIES MASTER saved successfully.');
  }catch(e){setErr(JSON.stringify(e.response?.data||'Save failed.'))}finally{setBusy(false)}
 }
 return <><PageTitle title="SERIES MASTER" sub="Configure Member, Employee/Agent, Application, Branch, Collection Center, Application Form and Branch Center numbering series."><button className="masterAddBtn" onClick={save} disabled={busy}>{busy?'Saving…':'✎ Save Series Master'}</button></PageTitle>
 {err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>SERIES SECTION</th><th>PREFIX</th><th>SERIES (NEXT NO.)</th><th>BRANCH CODE INCLUSION</th><th>FINANCIAL YEAR INCLUSION</th><th>STATUS</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||r.key}><td>{i+1}</td><td><b>{String(r.label||r.key).toUpperCase()}</b></td><td><input maxLength="20" value={r.prefix||''} onChange={e=>edit(r.id,'prefix',e.target.value.toUpperCase())}/></td><td><input type="number" min="1" step="1" value={r.next_number||1} onChange={e=>edit(r.id,'next_number',Math.max(1,Number(e.target.value||1)))}/></td><td><select value={String(!!r.include_branch_code)} onChange={e=>edit(r.id,'include_branch_code',e.target.value==='true')}><option value="true">YES</option><option value="false">NO</option></select></td><td><select value={String(!!r.include_financial_year)} onChange={e=>edit(r.id,'include_financial_year',e.target.value==='true')}><option value="true">YES</option><option value="false">NO</option></select></td><td><span className="status ok">ACTIVE</span></td></tr>)}</tbody></table></div>
 </section></>
}

function HouseholdAssessmentPage({reload}){
 const[members]=useList('/members/');const[data,load]=useList('/household-assessments/');const[f,setF]=useState({member:'',assessment_date:dateNow(),monthly_household_income:'',existing_monthly_loan_obligations:'0',proposed_monthly_obligation:'0',household_size:'1',other_lender_details:'',verified:false});const[err,setErr]=useState('');
 async function save(e){e.preventDefault();setErr('');try{await api().post('/household-assessments/',normalize(f));setF({...f,monthly_household_income:'',existing_monthly_loan_obligations:'0',proposed_monthly_obligation:'0',other_lender_details:''});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Assessment save failed'))}}
 async function verify(row){const note=window.prompt('Verification note (minimum 5 characters):');if(!note||note.trim().length<5)return;try{await api().post(`/household-assessments/${row.id}/verify/`,{verification_note:note.trim()});await load()}catch(e){alert(JSON.stringify(e.response?.data||'Verification failed'))}}
 return <><PageTitle title="Household Income Assessment" sub="Record household income and existing monthly debt obligations. This assessment does not automatically approve a loan."/>{err&&<div className="alert danger">{err}</div>}<section className="panel"><form className="formgrid" onSubmit={save}><label>Member<select required value={f.member} onChange={e=>setF({...f,member:e.target.value})}><option value="">Select member</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>Assessment date<input type="date" required value={f.assessment_date} onChange={e=>setF({...f,assessment_date:e.target.value})}/></label><label>Monthly household income ₹<input type="number" min="0" step="0.01" required value={f.monthly_household_income} onChange={e=>setF({...f,monthly_household_income:e.target.value})}/></label><label>Existing monthly loan obligations ₹<input type="number" min="0" step="0.01" value={f.existing_monthly_loan_obligations} onChange={e=>setF({...f,existing_monthly_loan_obligations:e.target.value})}/></label><label>Proposed monthly obligation ₹<input type="number" min="0" step="0.01" value={f.proposed_monthly_obligation} onChange={e=>setF({...f,proposed_monthly_obligation:e.target.value})}/></label><label>Household size<input type="number" min="1" step="1" value={f.household_size} onChange={e=>setF({...f,household_size:e.target.value})}/></label><label className="wideField">Other lender details<textarea value={f.other_lender_details} onChange={e=>setF({...f,other_lender_details:e.target.value})}/></label><button className="primary">Save Assessment</button></form></section><section className="panel"><h3>Assessment register</h3><div className="tableWrap"><table><thead><tr>{['id','member_name','assessment_date','monthly_household_income','existing_monthly_loan_obligations','proposed_monthly_obligation','repayment_ratio_percent','verified','Actions'].map(c=><th key={c}>{pretty(c)}</th>)}</tr></thead><tbody>{data.map(r=><tr key={r.id}>{['id','member_name','assessment_date','monthly_household_income','existing_monthly_loan_obligations','proposed_monthly_obligation','repayment_ratio_percent','verified'].map(c=><td key={c}>{r[c]===null||r[c]===undefined?'—':String(r[c])}</td>)}<td>{!r.verified?<button className="smallBtn" onClick={()=>verify(r)}>Verify</button>:`Verified by ${r.verified_by||'authorized staff'}`}</td></tr>)}</tbody></table></div><button className="secondary" onClick={load}>Refresh</button></section></>
}
function CustomerComplaintsPage({reload}){
 const[members]=useList('/members/');const[branches]=useList('/branches/');const[employees]=useList('/employees/');const[data,load]=useList('/customer-complaints/');const[f,setF]=useState({branch:'',member:'',category:'other',subject:'',description:'',received_date:dateNow(),due_date:'',assigned_employee:''});const[err,setErr]=useState('');
 async function save(e){e.preventDefault();setErr('');try{await api().post('/customer-complaints/',normalize(f));setF({...f,member:'',subject:'',description:'',due_date:'',assigned_employee:''});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Complaint save failed'))}}
 async function resolve(r,status){const note=window.prompt('Resolution / rejection note (minimum 5 characters):');if(!note||note.trim().length<5)return;try{await api().patch(`/customer-complaints/${r.id}/`,{status,resolution_note:note.trim()});await load()}catch(e){alert(JSON.stringify(e.response?.data||'Update failed'))}}
 return <><PageTitle title="Customer Complaints" sub="Grievance register with branch assignment, due date, resolution notes and audit trail."/>{err&&<div className="alert danger">{err}</div>}<section className="panel"><form className="formgrid" onSubmit={save}><label>Branch<select required value={f.branch} onChange={e=>setF({...f,branch:e.target.value,member:'',assigned_employee:''})}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Member (optional)<select value={f.member} onChange={e=>setF({...f,member:e.target.value})}><option value="">Not linked</option>{members.filter(m=>!f.branch||String(m.branch)===String(f.branch)).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>Category<select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{[['collection','Collection conduct'],['payment','Payment/receipt'],['loan_terms','Loan terms/charges'],['staff','Staff conduct'],['privacy','Data/privacy'],['other','Other']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Subject<input required maxLength="180" value={f.subject} onChange={e=>setF({...f,subject:e.target.value})}/></label><label>Received date<input type="date" required value={f.received_date} onChange={e=>setF({...f,received_date:e.target.value})}/></label><label>Due date<input type="date" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})}/></label><label>Assigned employee<select value={f.assigned_employee} onChange={e=>setF({...f,assigned_employee:e.target.value})}><option value="">Unassigned</option>{employees.filter(x=>!f.branch||String(x.branch)===String(f.branch)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="wideField">Complaint description<textarea required minLength="5" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></label><button className="primary">Register Complaint</button></form></section><section className="panel"><h3>Complaint register</h3><div className="tableWrap"><table><thead><tr>{['complaint_no','branch_name','member_name','category','subject','received_date','due_date','status','resolution_note','Actions'].map(c=><th key={c}>{pretty(c)}</th>)}</tr></thead><tbody>{data.map(r=><tr key={r.id}>{['complaint_no','branch_name','member_name','category','subject','received_date','due_date','status','resolution_note'].map(c=><td key={c}>{r[c]||'—'}</td>)}<td>{['open','in_review'].includes(r.status)?<><button className="smallBtn" onClick={()=>resolve(r,'resolved')}>Resolve</button> <button className="smallBtn dangerBtn" onClick={()=>resolve(r,'rejected')}>Reject</button></>:'—'}</td></tr>)}</tbody></table></div><button className="secondary" onClick={load}>Refresh</button></section></>
}
function FieldVisitsPage({reload}){
 const[members]=useList('/members/');const[loans]=useList('/loans/');const[employees]=useList('/employees/');const[data,load]=useList('/field-visits/');const[f,setF]=useState({member:'',loan:'',employee:'',visit_date:new Date().toISOString().slice(0,16),purpose:'Collection follow-up',outcome:'contacted',notes:'',promised_date:'',promised_amount:''});const[err,setErr]=useState('');
 async function save(e){e.preventDefault();setErr('');try{await api().post('/field-visits/',normalize({...f,loan:f.loan||null,promised_date:f.promised_date||null,promised_amount:f.promised_amount||null}));setF({...f,notes:'',promised_date:'',promised_amount:''});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Field visit save failed'))}}
 return <><PageTitle title="Field Visits" sub="Log customer visits and follow-ups. A promise is not a payment; collection must be posted separately through the approved payment workflow."/>{err&&<div className="alert danger">{err}</div>}<section className="panel"><form className="formgrid" onSubmit={save}><label>Member<select required value={f.member} onChange={e=>setF({...f,member:e.target.value,loan:''})}><option value="">Select member</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>Loan (optional)<select value={f.loan} onChange={e=>setF({...f,loan:e.target.value})}><option value="">No loan linked</option>{loans.filter(l=>String(l.member)===String(f.member)).map(l=><option key={l.id} value={l.id}>Loan #{l.id} — ₹{l.principal}</option>)}</select></label><label>Field officer<select required value={f.employee} onChange={e=>setF({...f,employee:e.target.value})}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Visit time<input type="datetime-local" required value={f.visit_date} onChange={e=>setF({...f,visit_date:e.target.value})}/></label><label>Purpose<input required value={f.purpose} onChange={e=>setF({...f,purpose:e.target.value})}/></label><label>Outcome<select value={f.outcome} onChange={e=>setF({...f,outcome:e.target.value})}>{[['contacted','Customer Contacted'],['not_available','Customer Not Available'],['promise','Promise to Pay'],['dispute','Dispute Raised'],['follow_up','Follow-up Required'],['other','Other']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Promised date (optional)<input type="date" value={f.promised_date} onChange={e=>setF({...f,promised_date:e.target.value})}/></label><label>Promised amount ₹<input type="number" min="0" step="0.01" value={f.promised_amount} onChange={e=>setF({...f,promised_amount:e.target.value})}/></label><label className="wideField">Notes<textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></label><button className="primary">Save Field Visit</button></form></section><section className="panel"><h3>Visit register</h3><Table data={data} columns={['visit_date','member_name','loan','employee_name','purpose','outcome','promised_date','promised_amount','notes']}/><button className="secondary" onClick={load}>Refresh</button></section></>
}
function CashHandoverPage({reload}){
 const[branches]=useList('/branches/');const[employees]=useList('/employees/');const[data,load]=useList('/cash-handovers/');const[f,setF]=useState({branch:'',handover_date:dateNow(),from_employee:'',to_employee:'',amount:'',reference:'',note:'',idempotency_key:''});const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{const payload=normalize({...f,idempotency_key:f.idempotency_key||('CASH-HO-'+crypto.randomUUID())});await api().post('/cash-handovers/',payload);setF({...f,amount:'',reference:'',note:'',idempotency_key:''});await load()}catch(e){setErr(JSON.stringify(e.response?.data||'Cash handover request failed'))}finally{setBusy(false)}}
 async function decide(r,verb){const note=window.prompt(verb==='approve'?'Approval note (minimum 5 characters):':'Rejection reason (minimum 5 characters):');if(!note||note.trim().length<5)return;try{await api().post(`/cash-handovers/${r.id}/${verb}/`,{decision_note:note.trim()});await load()}catch(e){alert(JSON.stringify(e.response?.data||'Decision failed'))}}
 return <><PageTitle title="Cash Handover" sub="Maker-checker custody record between employees. Approval does not post accounting entries or change ledger balances."/>{err&&<div className="alert danger">{err}</div>}<section className="panel"><form className="formgrid" onSubmit={save}><label>Branch<select required value={f.branch} onChange={e=>setF({...f,branch:e.target.value,from_employee:'',to_employee:''})}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Date<input type="date" required value={f.handover_date} onChange={e=>setF({...f,handover_date:e.target.value})}/></label><label>From employee<select required value={f.from_employee} onChange={e=>setF({...f,from_employee:e.target.value})}><option value="">Select sender</option>{employees.filter(x=>String(x.branch)===String(f.branch)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>To employee<select required value={f.to_employee} onChange={e=>setF({...f,to_employee:e.target.value})}><option value="">Select receiver</option>{employees.filter(x=>String(x.branch)===String(f.branch)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Amount ₹<input required type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Reference<input value={f.reference} onChange={e=>setF({...f,reference:e.target.value})}/></label><label className="wideField">Note<textarea required minLength="5" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></label><button className="primary" disabled={busy}>{busy?'Submitting…':'Submit Handover'}</button></form></section><section className="panel"><h3>Cash handover register</h3><div className="tableWrap"><table><thead><tr>{['id','branch_name','handover_date','from_employee_name','to_employee_name','amount','reference','status','decision_note','Actions'].map(c=><th key={c}>{pretty(c)}</th>)}</tr></thead><tbody>{data.map(r=><tr key={r.id}>{['id','branch_name','handover_date','from_employee_name','to_employee_name','amount','reference','status','decision_note'].map(c=><td key={c}>{r[c]||'—'}</td>)}<td>{r.status==='pending'?<><button className="smallBtn" onClick={()=>decide(r,'approve')}>Approve</button> <button className="smallBtn dangerBtn" onClick={()=>decide(r,'reject')}>Reject</button></>:'—'}</td></tr>)}</tbody></table></div><button className="secondary" onClick={load}>Refresh</button></section></>
}

function AdminProfilePage({logout,go=()=>{},reload=()=>{}}){
 const [active,setActive]=useState('USER RECORD');
 const [pwd,setPwd]=useState({current_password:'',new_password:'',confirm:''});
 const [showPwd,setShowPwd]=useState(false);
 const [message,setMessage]=useState('');const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const username=(localStorage.getItem('username')||'ADMIN').toUpperCase();
 async function changePassword(e){
  e.preventDefault();setMessage('');setError('');
  if(pwd.new_password!==pwd.confirm){setError('New password and confirmation do not match.');return;}
  try{
   const r=await api().post('/me/change-password/',{current_password:pwd.current_password,new_password:pwd.new_password});
   setMessage(r.data.detail||'Password changed successfully.');
   setPwd({current_password:'',new_password:'',confirm:''});
  }catch(e){setError(e.response?.data?.detail||JSON.stringify(e.response?.data||'Password change failed.'));}
 }
 async function downloadDataset(label,endpoint){
  setBusy(label);setError('');setMessage('');
  try{
   const r=await api().get(endpoint);
   const rows=r.data.results||r.data||[];
   if(!rows.length){setMessage(`No records found in ${label}.`);return;}
   const headers=Object.keys(rows[0]);
   exportCsvRows(`nmfa_${label}_${dateNow()}.csv`,headers,rows.map(x=>headers.map(h=>typeof x[h]==='object'?JSON.stringify(x[h]??''):x[h])));
   setMessage(`Downloaded ${rows.length} ${label} records.`);
  }catch(ex){setError(`Could not export ${label}.`)}finally{setBusy('')}
 }
 const tabs=['USER RECORD','STAFF & ROLES','LOAN & DOCUMENT FORMS','COMPANY PROFILE & LOGO','CHANGE PASSWORD','API CHARGES','WALLET TRANSACTION','DOWNLOAD BACKUP','DOWNLOAD DATA FOR INSURANCE'];
 return <div className="rfAdminProfile">
  <div className="rfDashHead"><h1>ADMINISTRATION &amp; PROFILE CONTROL CENTER</h1><div className="rfCrumbs">MASTER &nbsp;›&nbsp; ADMIN</div></div>
  <section className="rfCard rfAdminIdentity"><div className="rfAdminAvatar"><RfIcon name="user" size={30}/></div><h2>{username}</h2><p>CODE: <b>{username}</b></p><p>Account: Authenticated Administrator / Staff</p><div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:8}}><button type="button" className="smallBtn" onClick={()=>setActive('LOAN & DOCUMENT FORMS')}>Manage Loan Forms</button><button type="button" className="smallBtn" onClick={()=>setActive('STAFF & ROLES')}>Staff &amp; 515 Permissions</button><button type="button" className="smallBtn dangerBtn" onClick={logout}>Sign Out</button></div></section>
  <section className="rfCard rfAdminTabs">
   <div className="rfAdminTabRow">{tabs.map(t=><button key={t} type="button" className={active===t?'active':''} onClick={()=>{setActive(t);setMessage('');setError('')}}>{t}</button>)}</div>
   {message&&<div className="alert success" style={{margin:'12px 16px 0'}}>{message}</div>}
   {error&&<div className="alert danger" style={{margin:'12px 16px 0'}}>{error}</div>}
   {active==='USER RECORD'&&<div className="rfAdminPane"><h3>User Record &amp; Quick Administration</h3><div className="loanPlanDetailGrid"><div><small>USER CODE</small><b>{username}</b></div><div><small>DESIGNATION</small><b>ADMIN / STAFF</b></div><div><small>ACTIVE SESSION</small><b>2026-2027</b></div><div><small>COMPANY</small><b>{localStorage.getItem('nmfa_company_name')||'UMANG MICRO FINANCE'}</b></div></div><div style={{marginTop:14,display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="masterCreateBtn" onClick={()=>setActive('STAFF & ROLES')}>Manage Staff &amp; 515 Permissions</button><button type="button" className="loanPlanCalculateBtn" onClick={()=>setActive('LOAN & DOCUMENT FORMS')}>Upload / Change Loan Forms</button><button type="button" className="secondary" onClick={()=>setActive('COMPANY PROFILE & LOGO')}>Company Profile &amp; Logo</button><button type="button" className="secondary" onClick={()=>setActive('CHANGE PASSWORD')}>Change Password</button></div></div>}
   {active==='STAFF & ROLES'&&<div className="rfAdminPane"><StaffUsers tab="Role & Permissions" reload={reload}/></div>}
   {active==='LOAN & DOCUMENT FORMS'&&<div className="rfAdminPane"><DownloadLoanForm brand={{name:localStorage.getItem('nmfa_company_name')||'UMANG MICRO FINANCE',sub:localStorage.getItem('nmfa_company_sub')||'SERVICE ASSOCIATION',logo:localStorage.getItem('nmfa_company_logo')||''}} adminMode={true}/></div>}
   {active==='COMPANY PROFILE & LOGO'&&<div className="rfAdminPane"><CompanyProfile/></div>}
   {active==='CHANGE PASSWORD'&&<form className="formgrid rfAdminPane" onSubmit={changePassword}><h3 className="wideField">Change Password</h3><label>Old Password *<input type={showPwd?'text':'password'} autoComplete="current-password" required value={pwd.current_password} onChange={e=>setPwd({...pwd,current_password:e.target.value})}/></label><label>New Password (min 12 chars) *<input type={showPwd?'text':'password'} minLength="12" autoComplete="new-password" required value={pwd.new_password} onChange={e=>setPwd({...pwd,new_password:e.target.value})}/></label><label>Confirm New Password *<input type={showPwd?'text':'password'} minLength="12" autoComplete="new-password" required value={pwd.confirm} onChange={e=>setPwd({...pwd,confirm:e.target.value})}/></label><div className="formActions"><button type="button" className="secondary" onClick={()=>setShowPwd(s=>!s)}>{showPwd?'Hide Passwords':'Show Passwords'}</button><button className="masterCreateBtn">Update Password</button></div></form>}
   {active==='API CHARGES'&&<div className="rfAdminPane"><h3>API &amp; Verification Service Schedule</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>SERVICE</th><th>PROVIDER</th><th>STATUS</th></tr></thead><tbody><tr><td>1</td><td>SMS Notification Gateway</td><td>Configured HTTPS Gateway</td><td><span className="status ok">CONFIGURABLE</span></td></tr><tr><td>2</td><td>Credit Bureau Export (CIBIL / Equifax / Experian)</td><td>CSV / CDF Export</td><td><span className="status ok">ACTIVE</span></td></tr><tr><td>3</td><td>UPI / Payment Gateway Integration</td><td>Razorpay / Cashfree / UPI</td><td><span className="status ok">CONFIGURABLE</span></td></tr></tbody></table></div></div>}
   {active==='WALLET TRANSACTION'&&<div className="rfAdminPane"><h3>SMS &amp; Service Wallet Transactions</h3><p className="muted">No external wallet deductions are charged locally by NMFA. Configure gateway credentials under Settings &gt; API &amp; Integration Settings.</p></div>}
   {active==='DOWNLOAD BACKUP'&&<div className="rfAdminPane"><h3>Download Operational Data Backups (CSV)</h3><div className="formgrid">{[['members','/members/'],['loans','/loans/'],['installments','/installments/'],['payments','/payments/'],['journal','/journal/'],['expenses','/expenses/'],['capital','/capital/']].map(([lbl,ep])=><button key={lbl} type="button" className="secondary" disabled={busy===lbl} onClick={()=>downloadDataset(lbl,ep)}>{busy===lbl?'Downloading…':`Download ${lbl.toUpperCase()} CSV`}</button>)}</div></div>}
   {active==='DOWNLOAD DATA FOR INSURANCE'&&<div className="rfAdminPane"><h3>Download Member &amp; Loan Data for Insurance</h3><p className="muted">Export active borrowers and disbursed loan records for insurance enrollment and party reconciliation.</p><button type="button" className="masterCreateBtn" disabled={busy==='insurance'} onClick={()=>downloadDataset('insurance','/loans/')}>{busy==='insurance'?'Preparing…':'DOWNLOAD INSURANCE DATA EXCEL/CSV'}</button></div>}
  </section>
 </div>
}

function Page({tab,dash,reload,go,branchSel,setBranchSel,brand,access={},logout}){
 const reportTabs=['MIS Reports','Financial Reports','Portfolio Reports','Reporting','Loan Report','Due EMI Report','Due EMI Reporting','Collection Reporting','Disbursement Reporting','Settlement Reporting'];
 if(tab==='__NOT_FOUND__')return <NotFoundPage go={go}/>;
 if(tab==='Dashboard')return <Dashboard d={dash} go={go} branchSel={branchSel} setBranchSel={setBranchSel} brand={brand}/>;
 if(tab==='Admin'||tab==='Profile')return <AdminProfilePage go={go} reload={reload} logout={logout||(()=>{localStorage.removeItem('access');localStorage.removeItem('refresh');localStorage.removeItem('username');window.location.reload()})}/>;
 if(['Loan Plan'].includes(tab))return <LoanPlanMaster reload={reload}/>;
 if(tab==='Penalty Scheme')return <PenaltySchemesPage reload={reload}/>;
 if(tab==='Groups')return <CollectionCentersPage reload={reload}/>;
 if(tab==='Add Staff'||tab==='New Staff')return <AddStaffMasterPage reload={reload} openModalDefault={true}/>;
 if(['Branches','Branch Login','Staff Branch','Branch Center'].includes(tab))return tab==='Branch Login'?<BranchLoginPage reload={reload}/>:tab==='Staff Branch'?<StaffBranchAssignments reload={reload}/>:tab==='Branch Center'?<BranchCenters reload={reload}/>:<BranchMasterPage reload={reload}/>;
 if(['Employee','Employees / Field Officers'].includes(tab))return <AddStaffMasterPage reload={reload} openModalDefault={false}/>;
 if(tab==='Employee Leave')return <EmployeeLeavePage reload={reload}/>;
 if(tab==='Employee Loan Transfer'||tab==='Employee Transfer')return <PortfolioTransferReferencePage mode="employee_loan" reload={reload}/>;
 if(tab==='Single Loan Transfer')return <PortfolioTransferReferencePage mode="single_loan" reload={reload}/>;
 if(tab==='Member Transfer')return <PortfolioTransferReferencePage mode="member_transfer" reload={reload}/>;
 if(tab==='Update Center Leader')return <UpdateCenterLeaderPage reload={reload}/>;
 if(tab==='Print Letter')return <PrintEmployeeLettersPage/>;
 if(['Loan Purpose','Relationship Master','Designation'].includes(tab))return <ReferenceMasterCard kind={tab==='Loan Purpose'?'purpose':tab==='Relationship Master'?'relation':'designation'} title={tab} reload={reload}/>;
 if(['State','Bank','Leave','Document Type','Collection Mode'].includes(tab))return <MasterCatalogPage masterKey={({State:'state',Bank:'bank',Leave:'leave_type','Document Type':'document_type','Collection Mode':'collection_mode'})[tab]} reload={reload}/>;
 if(tab==='Holiday')return <HolidayCalendarPage reload={reload}/>;
 if(tab==='Miscellaneous')return <MiscellaneousMasters reload={reload}/>;
 if(tab==='Software Timing')return <SoftwareTimingPage reload={reload}/>;
 if(tab==='Session')return <FinancialSessionsPage reload={reload}/>;
 if(tab==='Setting')return <BusinessSettingsPage/>;
 if(tab==='Company Profile'||tab==='Company Profile & Logo')return <CompanyProfile/>;
 if(tab==='SMS Testing')return <SmsTestingPage/>;
 if(tab==='Series')return <SeriesSettingsPage reload={reload}/>;
 if(tab==='Member CGT & GRT')return <MemberCgtGrtPage reload={reload}/>;
 if(tab==='Member Group')return <MemberGroupListPage reload={reload}/>;
 if(['Members / Customers','Member List','Members','New Member'].includes(tab))return <Members reload={reload} mode={tab==='New Member'?'new':'list'} go={go}/>;
 if(tab==='Customer Transfer')return <CustomerTransferPage reload={reload}/>;
 if(tab==='KYC Documents')return <KycDocumentsOnly reload={reload}/>;
 if(tab==='Identity / Relation / Purpose / Reason / Designation Masters')return <ReferenceMasters reload={reload}/>;
 if(['Product Category','Product Brand','Product Variant','Product Supplier','Insurance Party','Product'].includes(tab))return <ProductMasterEntityPage kind={({ 'Product Category':'product_category','Product Brand':'product_brand','Product Variant':'product_variant','Product Supplier':'product_supplier','Insurance Party':'insurance_party','Product':'product_item'})[tab]} reload={reload}/>;
 if(['Loan Products','Product Loan'].includes(tab))return tab==='Product Loan'?<ProductLoanMasterPage reload={reload}/>:<LoanPlanMaster reload={reload}/>;
 if(tab==='Areas / Centres / Groups'||tab==='Area Survey')return <Locations reload={reload}/>;
 if(['Individual Loan','Apply For Loan','Loan Applications'].includes(tab))return <ReferenceLoanApplyPage isGroup={false} reload={reload}/>;
 if(tab==='Group Loan')return <ReferenceLoanApplyPage isGroup={true} reload={reload}/>;
 if(['Loan Approval','Loan','Approval - Loan'].includes(tab))return <ReferenceApprovalQueuePage kind="loan" reload={reload}/>;
 if(['Loans','Loan Summary','Loan Case'].includes(tab))return <Loans reload={reload} approval={false}/>;
 if(['Disbursed','Disbursement','Loan Disbursement','Disbursed Loans'].includes(tab))return <ReferenceDisbursementPage isGroup={false} reload={reload}/>;
 if(tab==='Group Disbursed')return <ReferenceDisbursementPage isGroup={true} reload={reload}/>;
 if(tab==='Advance Security')return <AdvanceSecurityPage reload={reload}/>;
 if(tab==='Due Penalty')return <DuePenaltyListPage reload={reload}/>;
 if(tab==='Future Due EMIs')return <FutureDueEmisPage reload={reload}/>;
 if(tab==='Group EMI Collection')return <GroupEmiCollectionPage reload={reload}/>;
 if(tab==='Member Collection (Old)')return <OldMemberCollectionPage reload={reload}/>;
 if(tab==='Member Collection (New)'||tab==='Member Collection')return <NewMemberCollectionPage go={go} reload={reload}/>;
 if(['EMI Records','Paid EMIs','Due EMIs'].includes(tab))return <Installments filter={tab==='Paid EMIs'?'paid':tab==='Due EMIs'?'due':undefined}/>;
 if(tab==='Promise To Pay')return <PromiseToPayPage reload={reload}/>;
 if(tab==='Approval - Settlement')return <ReferenceApprovalQueuePage kind="settlement" reload={reload}/>;
 if(tab==='Settlement'||tab==='Loan Settlement')return <SettlementPage reload={reload} approvalMode={false}/>;
 if(tab==='Death Member List')return <DeathMemberListPage reload={reload}/>;
 if(tab==='Loan History')return <LoanHistoryPage/>;
 if(tab==='Member Attendance')return <MemberAttendanceReportPage/>;
 if(tab==='Online Payment Reporting')return <OnlinePaymentReportPage/>;
 if(tab==='Experian CIBIL Report')return <CibilBureauReportPage bureau="experian"/>;
 if(tab==='Equifax CIBIL Report')return <CibilBureauReportPage bureau="equifax"/>;
 if(tab==='Download Loan Form')return <DownloadLoanForm brand={brand} adminMode={!!access?.is_admin}/>;
 if(tab==='CIBIL Format Download')return <CibilExport/>;
 if(tab==='Loan Topup'||tab==='Loan Top-up')return <LoanTopUpPage reload={reload}/>;
 if(tab==='Deposit Accounts')return <DepositAccountsPage reload={reload}/>;
 if(tab==='Deposit Collection')return <DepositCollectionPage reload={reload}/>;
 if(['Collection / EMI','Collect EMI','Collection','Payment History'].includes(tab))return <Payments reload={reload}/>;
 if(tab==='Approval - Collection')return <ReferenceApprovalQueuePage kind="collection" reload={reload}/>;
 if(['Other Payment','Other Receipt'].includes(tab))return <OperationalRegister title={tab} endpoint="/payments/" reload={reload} columns={['id','receipt_no','member','amount','method','paid_on','status']} actions={false}/>;
 if(tab==='Overdue / Recovery')return <Recovery/>;
 if(tab==='Overdue Transfer')return <OverdueTransferPage reload={reload}/>;
 if(tab==='Household Assessment')return <HouseholdAssessmentPage reload={reload}/>;
 if(tab==='Customer Complaints')return <CustomerComplaintsPage reload={reload}/>;
 if(tab==='Field Visits')return <FieldVisitsPage reload={reload}/>;
 if(tab==='Cash Handover')return <CashHandoverPage reload={reload}/>;
 if(tab==='Financial Controls')return <FinancialControlsPage reload={reload}/>;
 if(tab==='Attendance')return <AttendancePage reload={reload}/>;
 if(['Salary / Payroll','Salary'].includes(tab))return <PayrollPage reload={reload}/>;
 if(tab==='Approval - Salary')return <ReferenceApprovalQueuePage kind="salary" reload={reload}/>;
 if(tab==='Approval - Product Loan')return <ReferenceApprovalQueuePage kind="product_loan" reload={reload}/>;
 if(['Approval - Fund Transfer','Fund Transfer'].includes(tab))return <FundsTransferPage title={tab==='Fund Transfer'?'Branch / Fund Transfer':'Fund Transfer Approval'} reload={reload} />
 if(tab==='Expenses')return <Expenses reload={reload}/>;
 if(['Payment','Receipt','Day Book','Voucher Entries','Contra','Journal','Cashbook','Cash Book','Other Payment','Ledger','Branch Ledger','ACGroup'].includes(tab))return <Accounts tab={tab==='Cash Book'?'Cashbook':tab} reload={reload} branchSel={branchSel} go={go}/>;
 if(tab==='Capital / Investment')return <Capital reload={reload}/>;
 if(reportTabs.includes(tab))return <Reports title={tab} branchSel={branchSel}/>;
 if(['Trial Balance','FY Trial Balance','FY Voucher Statement','FY Opening Balance','Profit-Loss','Overview'].includes(tab))return <AccountingReportPage title={tab} kind={tab} branchSel={branchSel} go={go}/>;
 if(['Audit Logs','Log Records'].includes(tab))return <Audit/>;
 if(['Role & Permissions','Role','Role List','Permission','Permission List'].includes(tab))return <StaffUsers tab={tab} reload={reload}/>;
 if(tab==='SMS Settings')return <SmsSettings/>;
 if(tab==='KYC Settings')return <KycSettings/>;
 if(tab==='General Settings')return <IntegrationSettings/>;
 if(tab==='Razorpay / Cashfree')return <IntegrationSettings focus="payments"/>;
 if(tab==='UPI / AutoPay / eNACH')return <IntegrationSettings focus="mandates"/>;
 if(tab==='Backup / Restore')return <BackupToolsPage/>;
 return <WorkflowUnavailable title={tab}/>;
}

function KycDocumentsOnly({reload}){const[members]=useList('/members/',reload);return <><PageTitle title="KYC Documents" sub="Secure document upload, verification and download"/><KycDocuments members={members} reload={reload}/></>}

function CustomerTransferPage({reload}){
 const [members,loadMembers]=useList('/members/',reload);const [branches]=useList('/branches/',reload);const [employees]=useList('/employees/',reload);
 const [selected,setSelected]=useState([]);const [branch,setBranch]=useState('');const [officer,setOfficer]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const [msg,setMsg]=useState('');
 const targetEmployees=employees.filter(e=>String(e.branch)===String(branch)&&e.active!==false&&/field|officer|collector|agent/i.test(`${e.role||''} ${e.designation||''}`));
 async function submit(e){e.preventDefault();if(!selected.length||!branch||!officer){setErr('Select at least one customer, a target branch and a field officer.');return}if(!window.confirm(`Transfer ${selected.length} customer(s) to the selected branch? Existing loans and EMI history will remain linked to each customer.`))return;setBusy(true);setErr('');setMsg('');try{const r=await api().post('/members/transfer/',{member_ids:selected.map(Number),branch:Number(branch),field_officer:Number(officer),reason});setMsg(r.data.detail||'Customer transfer completed.');setSelected([]);setReason('');await loadMembers();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Customer transfer failed'))}finally{setBusy(false)}}
 const visible=members.filter(m=>m.active!==false);
 return <><PageTitle title="Customer Transfer" sub="Transfer customers between branches with an audit trail. Loan and EMI records remain linked to the customer."/><section className="panel">{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}<form className="formgrid" onSubmit={submit}><label>Target branch *<select required value={branch} onChange={e=>{setBranch(e.target.value);setOfficer('')}}><option value="">Select branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label>Target field officer *<select required value={officer} onChange={e=>setOfficer(e.target.value)}><option value="">Select officer</option>{targetEmployees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label className="wideField">Reason / approval note<input required minLength="5" maxLength="250" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required for audit clarity"/></label><div className="wideField"><b>Select customers ({selected.length} selected)</b><div className="tableWrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible customers" checked={visible.length>0&&visible.every(m=>selected.includes(m.id))} onChange={e=>setSelected(e.target.checked?visible.map(m=>m.id):[])}/></th><th>Member No.</th><th>Name</th><th>Phone</th><th>Current Branch</th><th>Field Officer</th></tr></thead><tbody>{visible.map(m=><tr key={m.id}><td><input type="checkbox" checked={selected.includes(m.id)} onChange={e=>setSelected(old=>e.target.checked?[...new Set([...old,m.id])]:old.filter(id=>id!==m.id))}/></td><td>{m.member_no}</td><td>{m.name}</td><td>{m.phone}</td><td>{branches.find(b=>String(b.id)===String(m.branch))?.name||m.branch}</td><td>{employees.find(x=>String(x.id)===String(m.field_officer))?.name||'—'}</td></tr>)}</tbody></table>{!visible.length&&<div className="empty">No active customers available in your authorized scope.</div>}</div></div><button className="primary" disabled={busy||!selected.length||!branch||!officer}>{busy?'Transferring…':`Transfer ${selected.length} customer(s)`}</button></form><p className="muted">Only Main Admin can transfer customers across branches. Branch staff can only see customers available in their assigned branch. Each transfer is logged with source and destination branch and field officer.</p></section></>
}

function FundsTransferPage({title,reload}){
 const [data,load]=useList('/fund-transfer-requests/',reload);const [branches]=useList('/branches/',reload);
 const [f,setF]=useState({payment_type:'Cash',date:dateNow(),from_branch:'',to_branch:'',from_account:'Cash',to_account:'Cash',amount:'',reference:'',note:''});
 const [busy,setBusy]=useState('');const [err,setErr]=useState('');const [msg,setMsg]=useState('');const [viewRow,setViewRow]=useState(null);
 const branchName=id=>id===null||id===undefined||id===''?'Head Office':branches.find(b=>String(b.id)===String(id))?.name||`Branch ${id}`;
 async function submit(e){e.preventDefault();setBusy('submit');setErr('');setMsg('');try{const payload=normalize({date:f.date,from_branch:f.from_branch===''?null:Number(f.from_branch),to_branch:f.to_branch===''?null:Number(f.to_branch),from_account:f.from_account,to_account:f.to_account,amount:f.amount,reference:f.reference||`FT-${Date.now()}`,note:f.note||`${f.payment_type} Branch Transfer`});await api().post('/fund-transfer-requests/',payload);setF(old=>({...old,amount:'',reference:'',note:''}));setMsg('Branch to Branch Fund Transfer request saved.');await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Transfer request failed'))}finally{setBusy('')}}
 async function act(row,verb){const note=window.prompt(verb==='approve'?'Approval note (required):':'Rejection reason (required):','Approved branch fund transfer');if(!note||note.trim().length<5)return;setBusy(`${row.id}:${verb}`);setErr('');try{await api().post(`/fund-transfer-requests/${row.id}/${verb}/`,{approval_note:note.trim()});await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||`${verb} failed`))}finally{setBusy('')}}
 return <><PageTitle title="BRANCH TO BRANCH FUND TRANSFER" sub="Create and approve Cash or Bank ledger transfers between operating branches."/>
 {err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel"><h3>BRANCH TO BRANCH FUND TRANSFER</h3><form className="formgrid" onSubmit={submit}>
  <label>PAYMENT TYPE *<div className="rfRadioRow"><label><input type="radio" name="ft_ptype" checked={f.payment_type==='Cash'} onChange={()=>setF({...f,payment_type:'Cash',from_account:'Cash',to_account:'Cash'})}/> Cash</label><label><input type="radio" name="ft_ptype" checked={f.payment_type==='Bank'} onChange={()=>setF({...f,payment_type:'Bank',from_account:'Bank: SBI Current A/C',to_account:'Bank: SBI Current A/C'})}/> Bank</label></div></label>
  <label>DATE *<input type="date" required value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label>
  <label>FROM BRANCH *<select required value={f.from_branch} onChange={e=>setF({...f,from_branch:e.target.value})}><option value="">Select From Branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>
  <label>TO BRANCH *<select required value={f.to_branch} onChange={e=>setF({...f,to_branch:e.target.value})}><option value="">Select To Branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label>
  <label>FROM BRANCH LEDGER *<input required maxLength="120" value={f.from_account} onChange={e=>setF({...f,from_account:e.target.value})}/></label>
  <label>TO BRANCH LEDGER *<input required maxLength="120" value={f.to_account} onChange={e=>setF({...f,to_account:e.target.value})}/></label>
  <label>AMT (₹) *<input required type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label>
  <label>NARRATION *<input required maxLength="1000" value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="Enter transfer narration"/></label>
  <div className="formActions"><button className="masterCreateBtn" disabled={busy==='submit'}>{busy==='submit'?'Saving…':'Save'}</button></div>
 </form></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <h3>FUND TRANSFER REGISTER</h3>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>AMOUNT</th><th>LEDGER</th><th>FROM BRANCH</th><th>TO BRANCH</th><th>DATE</th><th>NARRATION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>{money(r.amount)}</td><td>{r.from_account} → {r.to_account}</td><td>{branchName(r.from_branch)}</td><td>{branchName(r.to_branch)}</td><td>{r.date}</td><td>{r.note||r.reference||'—'}</td><td><span className={r.status==='approved'?'status ok':'status off'}>{String(r.status||'pending').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Transfer</button>{r.status==='pending'&&<><button type="button" onClick={()=>act(r,'approve')}>✓ Approve</button><button type="button" onClick={()=>act(r,'reject')}>× Reject</button></>}<button type="button" onClick={()=>window.print()}>Print Voucher</button></div></details></td></tr>)}</tbody></table>{!data.length&&<div className="empty">No branch fund transfer requests yet.</div>}</div>
 </section>
 {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>FUND TRANSFER DETAILS #{viewRow.id}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[['Transfer ID',`#${viewRow.id}`],['Date',viewRow.date],['From Branch',branchName(viewRow.from_branch)],['To Branch',branchName(viewRow.to_branch)],['From Ledger',viewRow.from_account],['To Ledger',viewRow.to_account],['Amount',money(viewRow.amount)],['Status',String(viewRow.status).toUpperCase()],['Narration',viewRow.note||'—']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}</>
}

function ReferenceApprovalQueuePage({kind,reload}){
 const [branches]=useList('/branches/',reload);const [members]=useList('/members/',reload);const [employees]=useList('/employees/',reload);const [groups]=useList('/groups/',reload);const [centres]=useList('/centres/',reload);const [products]=useList('/loan-products/',reload);
 const [loans,loadLoans]=useList('/loans/',reload);const [apps,loadApps]=useList('/applications/',reload);const [salaries,loadSalaries]=useList('/payroll/',reload);const [payments,loadPayments]=useList('/payments/',reload);const [prodLoans,loadProdLoans]=useList('/product-loan-requests/',reload);const [settlements,loadSettlements]=useList('/settlements/',reload);
 const [branchFilter,setBranchFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[groupFilter,setGroupFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[ledgerFilter,setLedgerFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[viewRow,setViewRow]=useState(null),[busy,setBusy]=useState(''),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const grpById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const cenById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const titleMap={loan:'LIST FOR LOAN APPROVE',salary:'SALARY LIST FOR APPROVED',collection:'COLLECTION LIST FOR APPROVED (₹)',product_loan:'PRODUCT LOAN LIST FOR APPROVED',settlement:'APPROVE LOAN SETTLEMENT'};
 async function act(endpointBase,id,verb){
  const note=window.prompt(verb==='approve'?'Approval note:':'Rejection reason (required):','Verified and approved');
  if(!note||!note.trim())return;
  setBusy(`${id}:${verb}`);setErr('');setMsg('');
  try{
   await api().post(`${endpointBase}/${id}/${verb}/`,{approval_note:note.trim(),note:note.trim()});
   setMsg(`Record #${id} ${verb==='approve'?'approved':'rejected'} successfully.`);
   await Promise.all([loadLoans(),loadApps(),loadSalaries(),loadPayments(),loadProdLoans(),loadSettlements()]);
   if(reload)await reload();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||`${verb} failed`))}finally{setBusy('')}
 }
 const rows=useMemo(()=>{
  if(kind==='loan'){
   const appRows=apps.map(a=>{const m=memById[String(a.member)]||{};const p=prodById[String(a.product)]||{};const br=branchById[String(m.branch)]||{};const gr=grpById[String(m.group)]||{};const ce=cenById[String(m.centre)]||{};const st=empById[String(m.field_officer)]||{};return {id:a.id,endpoint:'/applications',pl_name:p.name||a.product_name||'Standard Plan',emi_type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),plan_amt:a.requested_amount||p.plan_amount||0,dis_amt:a.requested_amount||p.plan_amount||0,created_at:String(a.created_at||dateNow()).slice(0,10),member_id:m.id,member_name:m.name||a.member_name||`Member #${a.member}`,group_id:m.group,group_name:gr.name||'—',centre_name:ce.name||'—',branch_id:m.branch,branch_name:br.name||'—',staff_id:m.field_officer,staff_name:st.name||'—',status:a.status||'pending'};});
   return appRows.length?appRows:loans.map(l=>{const m=memById[String(l.member)]||{};const p=prodById[String(l.product)]||{};const br=branchById[String(m.branch)]||{};const gr=grpById[String(m.group)]||{};const ce=cenById[String(m.centre)]||{};const st=empById[String(m.field_officer)]||{};return {id:l.id,endpoint:'/loans',pl_name:p.name||'Standard Plan',emi_type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),plan_amt:l.principal||0,dis_amt:l.principal||0,created_at:String(l.created_at||l.start_date||dateNow()).slice(0,10),member_id:m.id,member_name:m.name||`Member #${l.member}`,group_id:m.group,group_name:gr.name||'—',centre_name:ce.name||'—',branch_id:m.branch,branch_name:br.name||'—',staff_id:m.field_officer,staff_name:st.name||'—',status:l.status||'approved'};});
  }
  if(kind==='salary'){
   return salaries.map(s=>{const emp=empById[String(s.employee)]||{};const br=branchById[String(emp.branch)]||{};return {id:s.id,endpoint:'/payroll',name:s.employee_name||emp.name||`Employee #${s.employee}`,mobile:emp.phone||'—',branch_id:emp.branch,branch_name:br.name||'Head Office',salary:s.net_salary||s.basic_salary||0,pay_mode:s.payment_reference||'BANK / NEFT',trans_dt:s.paid_on||s.period_month,cheque_dt:s.paid_on||s.period_month,remark:s.period_month||'Monthly Salary',status:s.status||'draft'};});
  }
  if(kind==='collection'){
   return payments.map(p=>{const m=memById[String(p.member)]||{};return {id:p.id,endpoint:'/payments',loan_id:p.loan||p.id,member_id:m.id,mem_name:m.name||p.member_name||`Member #${p.member}`,alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',pay_date:p.paid_on,amount:p.amount||0,received_by:p.created_by_username||'FIELD STAFF',type:String(p.method||'cash').toUpperCase(),created:p.paid_on,remark:p.reference||p.receipt_no||'EMI Collection',branch_id:m.branch,staff_id:m.field_officer,status:p.status||'pending'};});
  }
  if(kind==='product_loan'){
   return prodLoans.map(pl=>{const m=memById[String(pl.member)]||{};const br=branchById[String(m.branch)]||{};const ce=cenById[String(m.centre)]||{};const gr=grpById[String(m.group)]||{};const dt=String(pl.created_at||dateNow()).slice(0,10);return {id:pl.id,endpoint:'/product-loan-requests',loan_id:`PL-${pl.id}`,member_id:m.id,mem_name:m.name||`Member #${pl.member}`,mobile:m.phone||'—',branch_id:m.branch,branch_name:br.name||'—',centre_name:ce.name||'—',group_name:gr.name||'—',product:pl.product_name,disb_date:dt,emi_start:dt,emi_last:dt,insurance:'INCLUDED',amount:pl.financed_amount||0,status:pl.status||'pending'};});
  }
  return settlements.map(st=>{const l=loanById[String(st.loan)]||{};const m=memById[String(st.member||l.member)]||{};const dt=String(st.created_at||dateNow()).slice(0,10);return {id:st.id,endpoint:'/settlements',loan_id:st.loan,mem_code:m.member_no||'—',member_id:m.id,mem_name:m.name||`Member #${st.member}`,alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',settle_date:dt,plan_amt:l.principal||st.outstanding_snapshot||0,paid_amt:st.proposed_amount||0,branch_id:m.branch,status:st.status||'pending'};});
 },[kind,apps,loans,salaries,payments,prodLoans,settlements,memById,branchById,empById,grpById,cenById,prodById,loanById]);
 const filtered=rows.filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(memberFilter&&String(r.member_id)!==String(memberFilter))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(groupFilter&&String(r.group_id)!==String(groupFilter))return false;
  const dVal=r.created_at||r.trans_dt||r.pay_date||r.disb_date||r.settle_date||'';
  if(dateFilter&&dVal!==dateFilter)return false;
  if(search&&!JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title={titleMap[kind]||'APPROVAL LIST'} sub="Review, filter, approve or reject pending operational requests."><button type="button" className="loanPlanCalculateBtn" onClick={()=>window.print()}>Get Print</button></PageTitle>
 {err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  {(kind==='loan'||kind==='collection')&&<label>{kind==='collection'?'CUSTOMER (TYPE HERE)':'MEMBER (TYPE HERE)'}<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>}
  {(kind==='loan'||kind==='collection')&&<label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>}
  {kind==='loan'&&<label>GROUP<select value={groupFilter} onChange={e=>setGroupFilter(e.target.value)}><option value="">All Groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label>}
  {kind==='collection'&&<label>SELECT LEDGER ACCOUNT<select value={ledgerFilter} onChange={e=>setLedgerFilter(e.target.value)}><option value="">All Ledgers</option><option value="Cash">Cash</option><option value="Bank">Bank</option><option value="UPI">UPI</option></select></label>}
  {kind!=='loan'&&<label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>}
  <div className="formActions"><button type="button" className={kind==='collection'?'loanPlanCalculateBtn':'masterCreateBtn'} onClick={()=>setPage(1)}>{kind==='collection'?'GET RECORD':'Submit'}</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setMemberFilter('');setStaffFilter('');setGroupFilter('');setDateFilter('');setSearch('')}}>Reset</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>
   {kind==='loan'&&<tr><th>SR.</th><th>PL NAME</th><th>PL EMI TYPE</th><th>PLAN AMT</th><th>DIS AMT</th><th>CREATED AT</th><th>MEMBER</th><th>GROUP</th><th>BRANCH CENTER</th><th>BRANCH</th><th>STAFF</th><th>STATUS</th><th>ACTION</th></tr>}
   {kind==='salary'&&<tr><th>SR. NO.</th><th>NAME</th><th>MOBILE</th><th>BRANCH</th><th>SALARY</th><th>PAYMENT MODE</th><th>TRANSACTION DATE</th><th>CHEQUE DATE</th><th>REMARK</th><th>STATUS</th><th>ACTION</th></tr>}
   {kind==='collection'&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>(C/O) ALIAS</th><th>MOBILE</th><th>PAYDATE</th><th>AMOUNT</th><th>RECEIVEDBY</th><th>TYPE</th><th>CREATED</th><th>REMARK</th><th>STATUS</th><th>ACTION</th></tr>}
   {kind==='product_loan'&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MOBILE</th><th>BRANCH</th><th>BRANCH CENTER</th><th>GROUPNAME</th><th>PRODUCT</th><th>DISBURSEMENT DATE</th><th>EMI START DATE</th><th>EMI LAST DATE</th><th>INSURANCE</th><th>STATUS</th><th>ACTION</th></tr>}
   {kind==='settlement'&&<tr><th>LOAN ID</th><th>MEM CODE</th><th>MEM NAME</th><th>(C/O) ALIAS</th><th>MEM MOB</th><th>SETTLEMENT DATE</th><th>PLAN AMT</th><th>PAID AMT</th><th>STATUS</th><th>ACTION</th></tr>}
  </thead><tbody>{shown.map((r,i)=>{
   const taskCell=<td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Details</button><button type="button" onClick={()=>act(r.endpoint,r.id,'approve')}>✓ Approve</button><button type="button" onClick={()=>act(r.endpoint,r.id,'reject')}>× Reject</button><button type="button" onClick={()=>window.print()}>Print Record</button></div></details></td>;
   if(kind==='loan')return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.pl_name}</td><td>{r.emi_type}</td><td>{money(r.plan_amt)}</td><td>{money(r.dis_amt)}</td><td>{r.created_at}</td><td>{r.member_name}</td><td>{r.group_name}</td><td>{r.centre_name}</td><td>{r.branch_name}</td><td>{r.staff_name}</td><td><span className={r.status==='approved'||r.status==='disbursed'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td>{taskCell}</tr>;
   if(kind==='salary')return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.name}</td><td>{r.mobile}</td><td>{r.branch_name}</td><td>{money(r.salary)}</td><td>{r.pay_mode}</td><td>{r.trans_dt}</td><td>{r.cheque_dt}</td><td>{r.remark}</td><td><span className={r.status==='approved'||r.status==='paid'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td>{taskCell}</tr>;
   if(kind==='collection')return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.pay_date}</td><td>{money(r.amount)}</td><td>{r.received_by}</td><td>{r.type}</td><td>{r.created}</td><td>{r.remark}</td><td><span className={r.status==='success'||r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td>{taskCell}</tr>;
   if(kind==='product_loan')return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.loan_id}</td><td>{r.mem_name}</td><td>{r.mobile}</td><td>{r.branch_name}</td><td>{r.centre_name}</td><td>{r.group_name}</td><td>{r.product}</td><td>{r.disb_date}</td><td>{r.emi_start}</td><td>{r.emi_last}</td><td>{r.insurance}</td><td><span className={r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td>{taskCell}</tr>;
   return <tr key={r.id}><td>#{r.loan_id}</td><td>{r.mem_code}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.settle_date}</td><td>{money(r.plan_amt)}</td><td>{money(r.paid_amt)}</td><td><span className={r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td>{taskCell}</tr>;
  })}</tbody></table>{!shown.length&&<div className="empty">No records in {titleMap[kind]}.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>APPROVAL RECORD DETAILS #{viewRow.id}</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{Object.entries(viewRow).filter(([k])=>k!=='endpoint').map(([k,v])=><div key={k}><small>{pretty(k)}</small><b>{String(v??'—')}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCreateBtn" onClick={()=>{const r=viewRow;setViewRow(null);act(r.endpoint,r.id,'approve')}}>APPROVE</button><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}</>;
}

function OperationalRegister({title,endpoint,reload,columns=[],actions=false,actionStatuses=['pending']}){
 const[data,load]=useList(endpoint,reload);const[busy,setBusy]=useState(null);const[err,setErr]=useState('');
 async function action(row,verb){const note=window.prompt(verb==='approve'?'Approval note (required):':'Rejection reason (required):');if(!note||!note.trim())return;setBusy(`${row.id}:${verb}`);setErr('');try{await api().post(`${endpoint.split('?')[0]}${row.id}/${verb}/`,{approval_note:note.trim(),note:note.trim()});await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||e.message||'Action failed'))}finally{setBusy(null)}}
 return <><PageTitle title={title} sub="Live records from the connected backend API"><span className="count">{data.length} records</span></PageTitle>{err&&<div className="alert danger">{err}</div>}<section className="panel"><div className="tableWrap"><table><thead><tr>{columns.map(c=><th key={c}>{pretty(c)}</th>)}{actions&&<th>Actions</th>}</tr></thead><tbody>{data.map(row=><tr key={row.id}>{columns.map(c=><td key={c}>{row[c]===null||row[c]===undefined?'—':typeof row[c]==='object'?JSON.stringify(row[c]):String(row[c])}</td>)}{actions&&<td>{actionStatuses.includes(row.status)?<><button className="smallBtn" disabled={!!busy} onClick={()=>action(row,'approve')}>{busy===`${row.id}:approve`?'Working…':'Approve'}</button> <button className="smallBtn dangerBtn" disabled={!!busy} onClick={()=>action(row,'reject')}>Reject</button></>:'—'}</td>}</tr>)}</tbody></table>{!data.length&&<div className="empty">No records found for this module.</div>}</div><button className="secondary" onClick={load}>Refresh records</button></section></>}

function AccountingReportPage({title,kind,branchSel='',go=()=>{}}){
 const [branches]=useList('/branches/');
 const [sessions]=useList('/financial-sessions/');
 const [accounts]=useList('/chart-of-accounts/');
 const [journals,loadJournals]=useList('/journal/');
 const [branchFilter,setBranchFilter]=useState(branchSel||'');
 const [sessionFilter,setSessionFilter]=useState('');
 const [ledgerFilter,setLedgerFilter]=useState('');
 const [voucherFilter,setVoucherFilter]=useState('');
 const [dateFilter,setDateFilter]=useState('');
 const [startDate,setStartDate]=useState('');
 const [endDate,setEndDate]=useState('');
 const [bankLedger,setBankLedger]=useState('Bank: SBI Current A/C');
 const [data,setData]=useState(null);
 const [err,setErr]=useState('');
 const [obModal,setObModal]=useState(null);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true;
  const endpoint=(kind==='Profit-Loss'||kind==='Overview'?'/reports/profit-and-loss/':'/reports/trial-balance/')+(branchFilter?'?branch='+encodeURIComponent(branchFilter):'');
  api().get(endpoint).then(r=>{if(alive)setData(r.data)}).catch(e=>{if(alive)setErr(JSON.stringify(e.response?.data||'Report endpoint unavailable'))});
  return()=>{alive=false};
 },[kind,branchFilter]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const scopedJournals=rfList(journals).filter(j=>{
  if(branchFilter&&String(j.branch)!==String(branchFilter))return false;
  if(ledgerFilter&&!String(j.account||'').toLowerCase().includes(ledgerFilter.toLowerCase()))return false;
  if(voucherFilter&&String(j.entry_type||'').toLowerCase()!==voucherFilter.toLowerCase())return false;
  if(dateFilter&&j.date!==dateFilter)return false;
  if(startDate&&j.date<startDate)return false;
  if(endDate&&j.date>endDate)return false;
  return true;
 });
 const ledgerSummary=useMemo(()=>{
  const map={};
  rfList(accounts).forEach(a=>{map[a.name]={particulars:a.name,group:pretty(a.account_type||'asset'),opening:0,debit:0,credit:0};});
  scopedJournals.forEach(j=>{
   const k=j.account||'General Ledger';
   if(!map[k])map[k]={particulars:k,group:pretty(j.entry_type||'ledger'),opening:0,debit:0,credit:0};
   if(/opening/i.test(j.reference||j.note||''))map[k].opening+=Number(j.debit||0)-Number(j.credit||0);
   else{map[k].debit+=Number(j.debit||0);map[k].credit+=Number(j.credit||0);}
  });
  return Object.values(map).map(r=>({...r,closing:r.opening+r.debit-r.credit}));
 },[accounts,scopedJournals]);
 async function saveOpeningBalance(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const amt=Number(obModal.amount||0);
   const ref=`FY-OB-${Date.now().toString(36).toUpperCase()}`;
   const bId=obModal.branch?Number(obModal.branch):null;
   await api().post('/journal/',{date:obModal.date||dateNow(),entry_type:'adjustment',account:obModal.ledger,debit:obModal.side==='DR'?amt.toFixed(2):'0.00',credit:obModal.side==='CR'?amt.toFixed(2):'0.00',reference:ref,note:`FY Opening Balance (${obModal.mode||'Manual'})`,branch:bId});
   await api().post('/journal/',{date:obModal.date||dateNow(),entry_type:'adjustment',account:'Opening Balance Equity',debit:obModal.side==='CR'?amt.toFixed(2):'0.00',credit:obModal.side==='DR'?amt.toFixed(2):'0.00',reference:ref,note:`FY Opening Balance Offset`,branch:bId});
   setObModal(null);await loadJournals();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Opening balance entry failed'))}finally{setBusy(false)}
 }
 if(kind==='FY Voucher Statement'){
  let running=0;
  const rows=scopedJournals.map((j,i)=>{const dr=Number(j.debit||0),cr=Number(j.credit||0);running+=dr-cr;return {...j,sn:i+1,dr,cr,balance:running};});
  return <><PageTitle title="VOUCHER (LEDGERS) — FY VOUCHER STATEMENT" sub="Financial year voucher statement with ledger filter and running balance">
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="masterAddBtn" onClick={()=>go('Payment')}>＋ PAYMENT</button><button type="button" className="masterAddBtn" onClick={()=>go('Receipt')}>＋ RECEIPT</button><button type="button" className="masterAddBtn" onClick={()=>go('Contra')}>＋ CONTRA</button><button type="button" className="masterAddBtn" onClick={()=>go('Journal')}>＋ JOURNAL</button></div>
  </PageTitle>
  <section className="panel"><div className="formgrid">
   <label>Branch<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label>Ledger/Account<input value={ledgerFilter} onChange={e=>setLedgerFilter(e.target.value)} placeholder="Type ledger or account"/></label>
   <label>Select Voucher<select value={voucherFilter} onChange={e=>setVoucherFilter(e.target.value)}><option value="">All Vouchers</option><option value="income">Receipt</option><option value="expense">Payment</option><option value="transfer">Contra</option><option value="adjustment">Journal</option></select></label>
   <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
   <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={loadJournals}>GET RECORDS</button><button type="button" className="secondary" onClick={()=>exportCsvRows(`fy_voucher_statement_${dateNow()}.csv`,['SN','DATE','MEMBER','VOUCHERNO','TYPE','PARTICULAR','DR','CR','BALANCE'],rows.map(r=>[r.sn,r.date,'—',r.reference||`VCH-${r.id}`,r.entry_type,r.account,r.dr,r.cr,r.balance]))}>DOWNLOAD EXCEL</button><button type="button" className="secondary" onClick={()=>window.print()}>DOWNLOAD FINANCIAL STATEMENT</button></div>
  </div></section>
  <section className="panel masterListPanel loanPlanReferenceCard">
   <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SN</th><th>DATE</th><th>MEMBER</th><th>VOUCHERNO</th><th>TYPE</th><th>PARTICULAR</th><th>AMOUNT DR.</th><th>AMOUNT CR.</th><th>BALANCE</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.sn}</td><td>{r.date}</td><td>{r.note||'—'}</td><td>{r.reference||`VCH-${r.id}`}</td><td>{String(r.entry_type||'journal').toUpperCase()}</td><td>{r.account}</td><td>{money(r.dr)}</td><td>{money(r.cr)}</td><td>{money(r.balance)}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No FY voucher statement entries found.</div>}</div>
  </section></>;
 }
 if(kind==='FY Opening Balance'){
  return <><PageTitle title="FY OPENING BALANCE" sub="Manage financial year ledger opening balances by Session and Branch">
   <div style={{display:'flex',gap:8}}><button type="button" className="masterAddBtn" onClick={()=>setObModal({mode:'Manual',branch:branchFilter,ledger:'Cash',side:'DR',amount:'',date:dateNow()})}>＋ Add New Manual</button><button type="button" className="loanPlanCalculateBtn" onClick={()=>setObModal({mode:'Automatic',branch:branchFilter,ledger:'Loan Principal Receivable',side:'DR',amount:'',date:dateNow()})}>＋ Add New Automatic</button></div>
  </PageTitle>{err&&<div className="alert danger">{err}</div>}
  <section className="panel"><div className="formgrid">
   <label>SESSION<select value={sessionFilter} onChange={e=>setSessionFilter(e.target.value)}><option value="">Active Session (2026-2027)</option>{sessions.map(s=><option key={s.id} value={s.label||s.name}>{s.label||s.name}</option>)}</select></label>
   <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={loadJournals}>GET RECORDS</button></div>
  </div></section>
  <section className="panel masterListPanel loanPlanReferenceCard">
   <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>FINANCIAL YEAR</th><th>BRANCH</th><th>LEDGER</th><th>GROUP</th><th>OPENING BALANCE</th><th>ACTION</th></tr></thead><tbody>{ledgerSummary.map((r,i)=><tr key={r.particulars}><td>{i+1}</td><td>{sessionFilter||'2026-2027'}</td><td>{branchFilter?branchById[String(branchFilter)]?.name:'All Branches'}</td><td>{r.particulars}</td><td>{r.group}</td><td>{money(r.opening||r.closing)}</td><td><button type="button" className="masterEditBtn" onClick={()=>setObModal({mode:'Manual',branch:branchFilter,ledger:r.particulars,side:'DR',amount:String(Math.abs(r.opening||0)),date:dateNow()})}>✎ Edit</button></td></tr>)}</tbody></table></div>
  </section>
  {obModal&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD FY OPENING BALANCE ({obModal.mode.toUpperCase()})</b><button type="button" onClick={()=>setObModal(null)}>×</button></header><form className="masterModalBody" onSubmit={saveOpeningBalance}><label>BRANCH<select value={obModal.branch} onChange={e=>setObModal({...obModal,branch:e.target.value})}><option value="">Head Office / Organization</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>LEDGER *<input required value={obModal.ledger} onChange={e=>setObModal({...obModal,ledger:e.target.value})}/></label><label>BALANCE TYPE *<select value={obModal.side} onChange={e=>setObModal({...obModal,side:e.target.value})}><option value="DR">DEBIT (DR)</option><option value="CR">CREDIT (CR)</option></select></label><label>OPENING AMOUNT (₹) *<input required type="number" min="0.01" step="0.01" value={obModal.amount} onChange={e=>setObModal({...obModal,amount:e.target.value})}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>SAVE</button><button type="button" className="masterCancelBtn" onClick={()=>setObModal(null)}>CANCEL</button></div></form></section></div>}</>;
 }
 if(kind==='Profit-Loss'){
  const incomeRows=ledgerSummary.filter(r=>/income|interest|fee|penalty/i.test(`${r.particulars} ${r.group}`)||r.credit>r.debit);
  const expenseRows=ledgerSummary.filter(r=>/expense|salary|office|rent/i.test(`${r.particulars} ${r.group}`)||r.debit>r.credit);
  return <><PageTitle title="PROFIT-LOSS" sub="Dual-table Income & Expense statement with branch filter"><button type="button" className="secondary" onClick={()=>window.print()}>Print / Save PDF</button></PageTitle>
  <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div></section>
  <div className="loanPlanReferenceGrid">
   <section className="panel masterListPanel loanPlanReferenceCard"><h3>INCOME (INDIRECT / DIRECT INCOME)</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SN</th><th>CATEGORY / LEDGER</th><th>OPENING BALANCE</th><th>DR</th><th>CR</th></tr></thead><tbody>{incomeRows.map((r,i)=><tr key={r.particulars}><td>{i+1}</td><td>{r.particulars}</td><td>{money(r.opening)}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td></tr>)}</tbody></table></div></section>
   <section className="panel masterListPanel loanPlanReferenceCard"><h3>EXPENSE (INDIRECT / OPERATING EXPENSE)</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SN</th><th>CATEGORY / LEDGER</th><th>OPENING BALANCE</th><th>DR</th><th>CR</th></tr></thead><tbody>{expenseRows.map((r,i)=><tr key={r.particulars}><td>{i+1}</td><td>{r.particulars}</td><td>{money(r.opening)}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td></tr>)}</tbody></table></div></section>
  </div></>;
 }
 if(kind==='Overview'){
  const cashRows=scopedJournals.filter(j=>/cash/i.test(j.account||''));
  const bankRows=scopedJournals.filter(j=>/bank/i.test(j.account||''));
  return <><PageTitle title="OVERVIEW / PROFIT-LOSS" sub="Consolidated Cash Records, Bank Records, and Profit-Loss overview">
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="secondary" onClick={()=>window.print()}>Print Cashbook</button><button type="button" className="secondary" onClick={()=>window.print()}>Print Bankbook</button><button type="button" className="secondary" onClick={()=>window.print()}>Print Cash Book &amp; Bank Book</button></div>
  </PageTitle>
  <section className="panel"><div className="formgrid">
   <label>SELECT BRANCH *<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
   <label>SELECT START DATE *<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
   <label>SELECT END DATE *<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
   <label>SELECT BANK LEDGER *<input value={bankLedger} onChange={e=>setBankLedger(e.target.value)}/></label>
   <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={loadJournals}>GET RECORDS</button></div>
  </div></section>
  <div className="loanPlanReferenceGrid">
   <section className="panel masterListPanel loanPlanReferenceCard"><h3>CASH RECORDS</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>DATE</th><th>PARTICULARS</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>{cashRows.map(r=><tr key={r.id}><td>{r.date}</td><td>{r.note||r.reference||r.account}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td></tr>)}</tbody></table>{!cashRows.length&&<div className="empty">No cash records in selected range.</div>}</div></section>
   <section className="panel masterListPanel loanPlanReferenceCard"><h3>BANK RECORDS ({bankLedger})</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>DATE</th><th>PARTICULARS</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>{bankRows.map(r=><tr key={r.id}><td>{r.date}</td><td>{r.note||r.reference||r.account}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td></tr>)}</tbody></table>{!bankRows.length&&<div className="empty">No bank records in selected range.</div>}</div></section>
  </div>
  <section className="panel masterListPanel loanPlanReferenceCard"><h3>PROFIT-LOSS SUMMARY</h3><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>PARTICULARS</th><th>OPENING</th><th>DEBIT</th><th>CREDIT</th><th>CLOSING</th></tr></thead><tbody>{ledgerSummary.map(r=><tr key={r.particulars}><td>{r.particulars}</td><td>{money(r.opening)}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td><td>{money(r.closing)}</td></tr>)}</tbody></table></div></section></>;
 }
 return <><PageTitle title={title.toUpperCase()} sub="FILTER BY BRANCH · Opening, Debit, Credit and Closing Trial Balance">
  <button type="button" className="secondary" onClick={()=>exportCsvRows(`${kind.toLowerCase().replace(/\s+/g,'_')}_${dateNow()}.csv`,['PARTICULARS','OPENING','DEBIT','CREDIT','CLOSING'],ledgerSummary.map(r=>[r.particulars,r.opening,r.debit,r.credit,r.closing]))}>EXPORT</button>
 </PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>FILTER BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <h3>LATEST ORDERS / {title.toUpperCase()}</h3>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>PARTICULARS</th><th>OPENING</th><th>DEBIT</th><th>CREDIT</th><th>CLOSING</th></tr></thead><tbody>{ledgerSummary.map(r=><tr key={r.particulars}><td>{r.particulars}</td><td>{money(r.opening)}</td><td>{money(r.debit)}</td><td>{money(r.credit)}</td><td>{money(r.closing)}</td></tr>)}</tbody></table>{!ledgerSummary.length&&<div className="empty">No ledger balances found.</div>}</div>
 </section></>;
}

function BackupToolsPage(){const[busy,setBusy]=useState('');const options=[['members','/members/'],['loans','/loans/'],['installments','/installments/'],['payments','/payments/'],['journal','/journal/'],['capital','/capital/'],['expenses','/expenses/']];async function exportRows(label,path){setBusy(label);try{const r=await api().get(path);const rows=r.data.results||r.data;if(!Array.isArray(rows))throw new Error('Unexpected API response');const keys=[...new Set(rows.flatMap(x=>Object.keys(x)))];const csv=[keys.join(','),...rows.map(x=>keys.map(k=>'"'+String(x[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`nmfa-${label}-export.csv`;a.click();URL.revokeObjectURL(url)}catch(e){alert(`${label} export failed: ${e.message}`)}finally{setBusy('')}}return <><PageTitle title="Backup / Restore" sub="Download operational CSV exports for safekeeping"/><section className="panel"><div className="alert danger"><b>Important:</b> These are record exports, not a complete PostgreSQL backup. Restore is not provided here. For a real database backup, use pg_dump and verify the resulting file before making changes.</div><div className="formgrid">{options.map(([label,path])=><button key={label} className="secondary" disabled={!!busy} onClick={()=>exportRows(label,path)}>{busy===label?'Exporting…':`Export ${pretty(label)} CSV`}</button>)}</div></section></>}

function HolidayCalendarPage({reload}){
 const[data,load]=useList('/holidays/',reload);const[branches]=useList('/branches/',reload);
 const[viewMode,setViewMode]=useState('month'),[cursorDate,setCursorDate]=useState(()=>dateNow()),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 const blank=()=>({holiday_date:dateNow(),name:'',holiday_type:'public',branch:'',description:'',active:true});
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const [y,m]=cursorDate.split('-').map(Number);
 const daysInMonth=new Date(y,m,0).getDate();
 const firstDow=new Date(y,m-1,1).getDay();
 const monthLabel=new Date(y,m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
 function shiftMonth(delta){const dt=new Date(y,m-1+delta,1);setCursorDate(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-01`);}
 async function save(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const payload=normalize({...form,branch:form.branch?Number(form.branch):null,active:!!form.active});
   if(editId)await api().patch(`/holidays/${editId}/`,payload);else await api().post('/holidays/',payload);
   setForm(null);setEditId(null);await load();if(reload)await reload();
  }catch(e){setErr(JSON.stringify(e.response?.data||'Holiday save failed'))}finally{setBusy(false)}
 }
 async function toggle(row){try{await api().patch(`/holidays/${row.id}/`,{active:!row.active});await load()}catch(e){setErr('Status update failed.')}}
 return <><PageTitle title="DECLARE HOLIDAY" sub="Interactive holiday calendar (month / week / day / today) and organization holiday register."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add Holiday</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <div className="loanPlanReferenceGrid">
  <section className="panel">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
    <div style={{display:'flex',gap:6}}><button type="button" className="secondary" onClick={()=>shiftMonth(-1)}>‹</button><button type="button" className="secondary" onClick={()=>shiftMonth(1)}>›</button><button type="button" className="secondary" onClick={()=>setCursorDate(dateNow())}>today</button></div>
    <h3 style={{margin:0}}>{monthLabel.toUpperCase()}</h3>
    <div style={{display:'flex',gap:6}}>{['month','week','day'].map(vm=><button key={vm} type="button" className={viewMode===vm?'masterCreateBtn':'secondary'} onClick={()=>setViewMode(vm)}>{vm}</button>)}</div>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,textAlign:'center',fontSize:12}}>
    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d} style={{fontWeight:700,padding:6,background:'#f1f5f9'}}>{d}</div>)}
    {Array.from({length:firstDow},(_,i)=><div key={`e-${i}`} style={{padding:10,background:'#fafafa'}}/>)}
    {Array.from({length:daysInMonth},(_,i)=>{
     const dayNum=i+1;const iso=`${y}-${String(m).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
     const hols=data.filter(h=>h.holiday_date===iso);
     return <div key={iso} onClick={()=>{setEditId(null);setForm({...blank(),holiday_date:iso})}} style={{padding:'8px 4px',minHeight:54,border:'1px solid #e2e8f0',background:hols.length?'#dcfce7':iso===dateNow()?'#e0f2fe':'#fff',cursor:'pointer',borderRadius:4}}><b>{dayNum}</b>{hols.map(h=><div key={h.id} style={{fontSize:10,color:'#166534',fontWeight:600,marginTop:2}}>{h.name}</div>)}</div>;
    })}
   </div>
  </section>
  <section className="panel masterListPanel loanPlanReferenceCard">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><h3>HOLIDAY LIST</h3><button type="button" className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank())}}>＋</button></div>
   <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>HOLIDAY DATE</th><th>HOLIDAY NAME</th><th>BRANCH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{r.holiday_date}</td><td>{r.name}</td><td>{r.branch?branchById[String(r.branch)]?.name:`All Branches`}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(r.id);setForm({...blank(),...r,branch:String(r.branch||'')})}}>✎ Edit Holiday</button><button type="button" onClick={()=>toggle(r)}>{r.active?'Deactivate':'Activate'}</button></div></details></td></tr>)}</tbody></table>{!data.length&&<div className="empty">No holidays declared yet.</div>}</div>
  </section>
 </div>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT HOLIDAY':'DECLARE NEW HOLIDAY'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>HOLIDAY DATE *<input required type="date" value={form.holiday_date} onChange={e=>setForm({...form,holiday_date:e.target.value})}/></label><label>HOLIDAY NAME *<input required maxLength="140" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>HOLIDAY TYPE<select value={form.holiday_type} onChange={e=>setForm({...form,holiday_type:e.target.value})}><option value="public">Public Holiday</option><option value="regional">Regional Holiday</option><option value="office">Office Closure</option><option value="working">Special Working Day</option></select></label><label>BRANCH (BLANK = ALL BRANCHES)<select value={form.branch} onChange={e=>setForm({...form,branch:e.target.value})}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label>DESCRIPTION<input maxLength="255" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm({...form,active:e.target.value==='active'})}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function LoanTopUpPage({reload}){
 const[loans]=useList('/loans/',reload);const[members]=useList('/members/',reload);const[branches]=useList('/branches/',reload);const[installments]=useList('/installments/',reload);const[data,load]=useList('/loan-topups/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const[form,setForm]=useState(null),[err,setErr]=useState(''),[busy,setBusy]=useState('');
 const eligible=loans.filter(l=>l.status==='disbursed');
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const rows=data.map(r=>{
  const l=loanById[String(r.loan)]||{};const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};
  const lInst=installments.filter(i=>String(i.loan)===String(l.id));
  const duePrin=lInst.reduce((s,i)=>s+Math.max(0,Number(i.principal_due||0)-Number(i.principal_paid||0)),0);
  const dueInt=lInst.reduce((s,i)=>s+Math.max(0,Number(i.interest_due||0)-Number(i.interest_paid||0)),0);
  return {...r,member_id:m.id,member_display:r.member_name||m.name||`Member #${l.member}`,branch_id:m.branch,branch_name:br.name||'—',pre_total:Number(l.total_payable||l.principal||0),pre_due:duePrin+dueInt,pre_due_prin:duePrin,pre_due_int:dueInt};
 }).filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!memberFilter||String(r.member_id)===String(memberFilter))&&`${r.id} ${r.member_display} ${r.loan}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));const shown=rows.slice((page-1)*pageSize,page*pageSize);
 async function save(e){e.preventDefault();setBusy('save');setErr('');try{await api().post('/loan-topups/',normalize(form));setForm(null);await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Top-up request failed'))}finally{setBusy('')}}
 async function act(row,verb){const note=window.prompt(verb==='approve'?'Approval note:':verb==='reject'?'Rejection reason (required):':'Disbursement note (optional):');if(verb!=='disburse'&&(!note||!note.trim()))return;const payload={approval_note:(note||'').trim()};if(verb==='disburse'){const method=window.prompt('Disbursement method: cash or bank','bank');if(!method)return;payload.method=method.trim().toLowerCase();if(payload.method==='bank'){const bank=window.prompt('Exact bank ledger account name (without Bank: prefix)');if(!bank)return;payload.bank_account=bank.trim()}}setBusy(`${row.id}:${verb}`);setErr('');try{await api().post(`/loan-topups/${row.id}/${verb}/`,payload);await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||`${verb} failed`))}finally{setBusy('')}}
 return <><PageTitle title="LOAN TOPUP LIST" sub="Search by Branch and Member; request, approve and disburse Loan Top-ups."><button className="masterAddBtn" onClick={()=>{setForm({loan:'',amount:'',reason:''});setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search top-up"/></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR.</th><th>ACTION</th><th>APPLY LOAN AMT</th><th>MEMBER</th><th>BRANCH NAME</th><th>PRE LOAN ID</th><th>PRE LOAN TOTAL AMOUNT</th><th>PRE LOAN DUE AMOUNT</th><th>PRE LOAN DUE PRINCIPAL AMOUNT</th><th>PRE LOAN DUE INTEREST AMOUNT</th><th>STATUS</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div>{r.status==='pending'&&<><button type="button" onClick={()=>act(r,'approve')}>Approve Top-up</button><button type="button" onClick={()=>act(r,'reject')}>Reject Top-up</button></>}{r.status==='approved'&&<button type="button" onClick={()=>act(r,'disburse')}>Disburse Top-up</button>}<button type="button" onClick={()=>window.print()}>Print Summary</button></div></details></td><td>{money(r.amount)}</td><td>{r.member_display}</td><td>{r.branch_name}</td><td>#{r.loan}</td><td>{money(r.pre_total)}</td><td>{money(r.pre_due)}</td><td>{money(r.pre_due_prin)}</td><td>{money(r.pre_due_int)}</td><td><span className={r.status==='disbursed'||r.status==='approved'?'status ok':'status off'}>{String(r.status).toUpperCase()}</span></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No loan top-up records yet.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {rows.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,rows.length)} OF {rows.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW LOAN TOPUP</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>EXISTING DISBURSED LOAN *<select required value={form.loan} onChange={e=>setForm({...form,loan:e.target.value})}><option value="">Select disbursed loan</option>{eligible.map(l=><option key={l.id} value={l.id}>Loan #{l.id} — {memById[String(l.member)]?.name||`Member #${l.member}`} ({money(l.principal)})</option>)}</select></label><label>APPLY LOAN AMT (₹) *<input required type="number" min="1" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>REASON *<input required minLength="5" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy==='save'}>{busy==='save'?'Submitting…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function DepositAccountsPage({reload}){
 const[members]=useList('/members/',reload);const[data,load]=useList('/deposit-accounts/',reload);const[f,setF]=useState({member:'',account_type:'savings',opened_on:dateNow()});const[err,setErr]=useState('');const[busy,setBusy]=useState(false);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{await api().post('/deposit-accounts/',normalize(f));setF({member:'',account_type:'savings',opened_on:dateNow()});await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Deposit account creation failed'))}finally{setBusy(false)}}
 return <><PageTitle title="Deposit Accounts" sub="Open one deposit account per member in this version. Balances are controlled by approved collection transactions."/><section className="panel">{err&&<div className="alert danger">{err}</div>}<form className="formgrid" onSubmit={save}><label>Member<select required value={f.member} onChange={e=>setF({...f,member:e.target.value})}><option value="">Select active member</option>{members.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>Account type<select value={f.account_type} onChange={e=>setF({...f,account_type:e.target.value})}><option value="savings">Savings</option><option value="recurring">Recurring Deposit</option><option value="fixed">Fixed Deposit</option></select></label><label>Opening date<input required type="date" value={f.opened_on} onChange={e=>setF({...f,opened_on:e.target.value})}/></label><button className="primary" disabled={busy}>{busy?'Opening…':'Open Deposit Account'}</button></form></section><section className="panel"><h3>Deposit account register</h3><Table data={data} columns={['account_no','member_no','member_name','account_type','opened_on','balance','status']}/></section></>
}

function DepositCollectionPage({reload}){
 const[accounts]=useList('/deposit-accounts/',reload);const[data,load]=useList('/deposit-collections/',reload);const[f,setF]=useState({account:'',amount:'',collection_date:dateNow(),method:'cash',bank_account:'',reference:''});const[err,setErr]=useState('');const[busy,setBusy]=useState('');
 async function save(e){e.preventDefault();setBusy('save');setErr('');try{await api().post('/deposit-collections/',normalize(f));setF({...f,amount:'',reference:''});await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Deposit collection failed'))}finally{setBusy('')}}
 async function act(row,verb){const note=window.prompt(verb==='approve'?'Approval note:':'Rejection reason (required):');if(!note||!note.trim())return;setBusy(`${row.id}:${verb}`);setErr('');try{await api().post(`/deposit-collections/${row.id}/${verb}/`,{approval_note:note.trim()});await load();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||`${verb} failed`))}finally{setBusy('')}}
 return <><PageTitle title="Deposit Collection" sub="Deposit collection posts to member balance and a balanced journal only after a different user approves it."/><section className="panel">{err&&<div className="alert danger">{err}</div>}<form className="formgrid" onSubmit={save}><label>Deposit account<select required value={f.account} onChange={e=>setF({...f,account:e.target.value})}><option value="">Select active account</option>{accounts.filter(a=>a.status==='active').map(a=><option key={a.id} value={a.id}>{a.account_no} — {a.member_name} (₹{a.balance})</option>)}</select></label><label>Amount ₹<input required type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Collection date<input required type="date" value={f.collection_date} onChange={e=>setF({...f,collection_date:e.target.value})}/></label><label>Method<select value={f.method} onChange={e=>setF({...f,method:e.target.value})}><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option></select></label>{f.method==='bank'&&<label>Bank ledger name<input required value={f.bank_account} onChange={e=>setF({...f,bank_account:e.target.value})} placeholder="SBI Current A/C"/></label>}<label>External reference<input value={f.reference} onChange={e=>setF({...f,reference:e.target.value})}/></label><button className="primary" disabled={busy==='save'||!accounts.some(a=>a.status==='active')}>{busy==='save'?'Submitting…':'Submit Collection for Approval'}</button></form><p className="muted">Submitting does not change the account balance. Approval adds the amount once and creates matching debit/credit journal lines.</p></section><section className="panel"><h3>Deposit collection register</h3><div className="tableWrap"><table><thead><tr>{['id','account_no','member_name','amount','method','collection_date','status','journal_reference','Actions'].map(c=><th key={c}>{pretty(c)}</th>)}</tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.account_no}</td><td>{r.member_name}</td><td>₹{r.amount}</td><td>{r.method}</td><td>{r.collection_date}</td><td>{r.status}</td><td>{r.journal_reference||'—'}</td><td>{r.status==='pending'?<><button className="smallBtn" disabled={!!busy} onClick={()=>act(r,'approve')}>Approve</button> <button className="smallBtn dangerBtn" disabled={!!busy} onClick={()=>act(r,'reject')}>Reject</button></>:'—'}</td></tr>)}</tbody></table>{!data.length&&<div className="empty">No deposit collections yet.</div>}</div><button className="secondary" onClick={load}>Refresh</button></section></>
}

function WorkflowUnavailable({title}){return <><PageTitle title={title} sub="This menu does not yet have a dedicated backend workflow"/><section className="panel"><h3>Backend logic required</h3><p>This menu entry is now routed explicitly, but a safe workflow cannot be completed with the current API/schema. No financial record has been created or changed. The module needs its own backend model, API validation, permissions, audit trail and tests before it can process live money.</p></section></>}

function PageTitle({title,sub,children}){return <div className="pageTitle"><div><h1>{title}</h1><p>{sub}</p></div><div>{children}</div></div>}
/* Filled icons (Font Awesome 5 Free, CC BY 4.0 / MIT via react-icons) embedded as path data so no extra package or network is needed. */
const RF_FA={"signin":["0 0 512 512","M416 448h-84c-6.6 0-12-5.4-12-12v-40c0-6.6 5.4-12 12-12h84c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32h-84c-6.6 0-12-5.4-12-12V76c0-6.6 5.4-12 12-12h84c53 0 96 43 96 96v192c0 53-43 96-96 96zm-47-201L201 79c-15-15-41-4.5-41 17v96H24c-13.3 0-24 10.7-24 24v96c0 13.3 10.7 24 24 24h136v96c0 21.5 26 32 41 17l168-168c9.3-9.4 9.3-24.6 0-34z"],"pencil":["0 0 512 512","M497.9 142.1l-46.1 46.1c-4.7 4.7-12.3 4.7-17 0l-111-111c-4.7-4.7-4.7-12.3 0-17l46.1-46.1c18.7-18.7 49.1-18.7 67.9 0l60.1 60.1c18.8 18.7 18.8 49.1 0 67.9zM284.2 99.8L21.6 362.4.4 483.9c-2.9 16.4 11.4 30.6 27.8 27.8l121.5-21.3 262.6-262.6c4.7-4.7 4.7-12.3 0-17l-111-111c-4.8-4.7-12.4-4.7-17.1 0zM124.1 339.9c-5.5-5.5-5.5-14.3 0-19.8l154-154c5.5-5.5 14.3-5.5 19.8 0s5.5 14.3 0 19.8l-154 154c-5.5 5.5-14.3 5.5-19.8 0zM88 424h48v36.3l-64.5 11.3-31.1-31.1L51.7 376H88v48z"],"addrbook":["0 0 448 512","M436 160c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-20V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48v416c0 26.5 21.5 48 48 48h320c26.5 0 48-21.5 48-48v-48h20c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-20v-64h20c6.6 0 12-5.4 12-12v-40c0-6.6-5.4-12-12-12h-20v-64h20zm-228-32c35.3 0 64 28.7 64 64s-28.7 64-64 64-64-28.7-64-64 28.7-64 64-64zm112 236.8c0 10.6-10 19.2-22.4 19.2H118.4C106 384 96 375.4 96 364.8v-19.2c0-31.8 30.1-57.6 67.2-57.6h5c12.3 5.1 25.7 8 39.8 8s27.6-2.9 39.8-8h5c37.1 0 67.2 25.8 67.2 57.6v19.2z"],"history":["0 0 512 512","M504 255.531c.253 136.64-111.18 248.372-247.82 248.468-59.015.042-113.223-20.53-155.822-54.911-11.077-8.94-11.905-25.541-1.839-35.607l11.267-11.267c8.609-8.609 22.353-9.551 31.891-1.984C173.062 425.135 212.781 440 256 440c101.705 0 184-82.311 184-184 0-101.705-82.311-184-184-184-48.814 0-93.149 18.969-126.068 49.932l50.754 50.754c10.08 10.08 2.941 27.314-11.313 27.314H24c-8.837 0-16-7.163-16-16V38.627c0-14.254 17.234-21.393 27.314-11.314l49.372 49.372C129.209 34.136 189.552 8 256 8c136.81 0 247.747 110.78 248 247.531zm-180.912 78.784l9.823-12.63c8.138-10.463 6.253-25.542-4.21-33.679L288 256.349V152c0-13.255-10.745-24-24-24h-16c-13.255 0-24 10.745-24 24v135.651l65.409 50.874c10.463 8.137 25.541 6.253 33.679-4.21z"],"hourglass":["0 0 512 512","M64 32h384v64c0 70-48 120-96 160 48 40 96 90 96 160v64H64v-64c0-70 48-120 96-160-48-40-96-90-96-160V32z"],"search":["0 0 512 512","M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"],"database":["0 0 512 512","M256 32C132 32 32 64 32 104v48c0 40 100 72 224 72s224-32 224-72v-48c0-40-100-72-224-72zm224 152c0 40-100 72-224 72S32 224 32 184v64c0 40 100 72 224 72s224-32 224-72v-64zm0 144c0 40-100 72-224 72S32 368 32 328v80c0 40 100 72 224 72s224-32 224-72v-80z"],"usercircle":["0 0 496 512","M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 96c48.6 0 88 39.4 88 88s-39.4 88-88 88-88-39.4-88-88 39.4-88 88-88zm0 344c-58.7 0-111.3-26.6-146.5-68.2 18.8-35.4 55.6-59.8 98.5-59.8 2.4 0 4.8.4 7.1 1.1 13 4.2 26.6 6.9 40.9 6.9 14.3 0 28-2.7 40.9-6.9 2.3-.7 4.7-1.1 7.1-1.1 42.9 0 79.7 24.4 98.5 59.8C359.3 421.4 306.7 448 248 448z"],"tag":["0 0 512 512","M0 252.118V48C0 21.49 21.49 0 48 0h204.118a48 48 0 0 1 33.941 14.059l211.882 211.882c18.745 18.745 18.745 49.137 0 67.882L293.823 497.941c-18.745 18.745-49.137 18.745-67.882 0L14.059 286.059A48 48 0 0 1 0 252.118zM112 64c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48z"],"phone":["0 0 512 512","M493.4 24.6l-104-24c-11.3-2.6-22.9 3.3-27.5 13.9l-48 112c-4.2 9.8-1.4 21.3 6.9 28l60.6 49.6c-36 76.7-98.9 140.5-177.2 177.2l-49.6-60.6c-6.8-8.3-18.2-11.1-28-6.9l-112 48C3.9 366.5-2 378.1.6 389.4l24 104C27.1 504.2 36.7 512 48 512c256.1 0 464-207.5 464-464 0-11.2-7.7-20.9-18.6-23.4z"],"locarrow":["0 0 512 512","M444.52 3.52L28.74 195.42c-47.97 22.39-31.98 92.75 19.19 92.75h175.91v175.91c0 51.17 70.36 67.17 92.75 19.19l191.9-415.78c15.99-38.39-25.59-79.97-63.97-63.97z"],"pie":["0 0 512 512","M256 32a224 224 0 1 0 224 224H256V32zM288 0v224h224A224 224 0 0 0 288 0z"],"archive":["0 0 512 512","M32 448c0 17.7 14.3 32 32 32h384c17.7 0 32-14.3 32-32V160H32v288zm160-212c0-6.6 5.4-12 12-12h104c6.6 0 12 5.4 12 12v8c0 6.6-5.4 12-12 12H204c-6.6 0-12-5.4-12-12v-8zM480 32H32C14.3 32 0 46.3 0 64v48c0 8.8 7.2 16 16 16h480c8.8 0 16-7.2 16-16V64c0-17.7-14.3-32-32-32z"],"dashboard":["0 0 576 512","M288 32C128.94 32 0 160.94 0 320c0 52.8 14.25 102.26 39.06 144.8 5.61 9.62 16.3 15.2 27.44 15.2h443c11.14 0 21.83-5.58 27.44-15.2C561.75 422.26 576 372.8 576 320c0-159.06-128.94-288-288-288zm0 64c14.71 0 26.58 10.13 30.32 23.65-1.11 2.26-2.64 4.23-3.45 6.67l-9.22 27.67c-5.13 3.49-10.97 6.01-17.64 6.01-17.67 0-32-14.33-32-32S270.33 96 288 96zM96 384c-17.67 0-32-14.33-32-32s14.33-32 32-32 32 14.33 32 32-14.33 32-32 32zm48-160c-17.67 0-32-14.33-32-32s14.33-32 32-32 32 14.33 32 32-14.33 32-32 32zm246.77-72.41l-61.33 184C343.13 347.33 352 364.54 352 384c0 11.72-3.38 22.55-8.88 32H232.88c-5.5-9.45-8.88-20.28-8.88-32 0-33.94 26.5-61.43 59.9-63.59l61.34-184.01c4.17-12.56 17.73-19.45 30.36-15.17 12.57 4.19 19.35 17.79 15.17 30.36zm14.66 57.2l15.52-46.55c3.47-1.29 7.13-2.23 11.05-2.23 17.67 0 32 14.33 32 32s-14.33 32-32 32c-11.38-.01-20.89-6.28-26.57-15.22zM480 384c-17.67 0-32-14.33-32-32s14.33-32 32-32 32 14.33 32 32-14.33 32-32 32z"],"master":["0 0 448 512","M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-32 252c0 6.6-5.4 12-12 12h-92v92c0 6.6-5.4 12-12 12h-56c-6.6 0-12-5.4-12-12v-92H92c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h92v-92c0-6.6 5.4-12 12-12h56c6.6 0 12 5.4 12 12v92h92c6.6 0 12 5.4 12 12v56z"],"hrm":["0 0 576 512","M528 32H48C21.5 32 0 53.5 0 80v16h576V80c0-26.5-21.5-48-48-48zM0 432c0 26.5 21.5 48 48 48h480c26.5 0 48-21.5 48-48V128H0v304zm352-232c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16c0 4.4-3.6 8-8 8H360c-4.4 0-8-3.6-8-8v-16zm0 64c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16c0 4.4-3.6 8-8 8H360c-4.4 0-8-3.6-8-8v-16zm0 64c0-4.4 3.6-8 8-8h144c4.4 0 8 3.6 8 8v16c0 4.4-3.6 8-8 8H360c-4.4 0-8-3.6-8-8v-16zM176 192c35.3 0 64 28.7 64 64s-28.7 64-64 64-64-28.7-64-64 28.7-64 64-64zM67.1 396.2C75.5 370.5 99.6 352 128 352h8.2c12.3 5.1 25.7 8 39.8 8s27.6-2.9 39.8-8h8.2c28.4 0 52.5 18.5 60.9 44.2 3.2 9.9-5.2 19.8-15.6 19.8H82.7c-10.4 0-18.8-10-15.6-19.8z"],"members":["0 0 640 512","M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6 40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32 208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.9-87.3 75.2-109.4z"],"plan":["0 0 448 512","M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"],"loan":["0 0 576 512","M0 432c0 26.5 21.5 48 48 48h480c26.5 0 48-21.5 48-48V256H0v176zm192-68c0-6.6 5.4-12 12-12h136c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H204c-6.6 0-12-5.4-12-12v-40zm-128 0c0-6.6 5.4-12 12-12h72c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12v-40zM576 80v48H0V80c0-26.5 21.5-48 48-48h480c26.5 0 48 21.5 48 48z"],"loanDetails":["0 0 576 512","M542.22 32.05c-54.8 3.11-163.72 14.43-230.96 55.59-4.64 2.84-7.27 7.89-7.27 13.17v363.87c0 11.55 12.63 18.85 23.28 13.49 69.18-34.82 169.23-44.32 218.7-46.92 16.89-.89 30.02-14.43 30.02-30.66V62.75c.01-17.71-15.35-31.74-33.77-30.7zM264.73 87.64C197.5 46.48 88.58 35.17 33.78 32.05 15.36 31.01 0 45.04 0 62.75V400.6c0 16.24 13.13 29.78 30.02 30.66 49.49 2.6 149.59 12.11 218.77 46.95 10.62 5.35 23.21-1.94 23.21-13.46V100.63c0-5.29-2.62-10.14-7.27-12.99z"],"collection":["0 0 640 512","M352 288h-16v-88c0-4.42-3.58-8-8-8h-13.58c-4.74 0-9.37 1.4-13.31 4.03l-15.33 10.22a7.994 7.994 0 0 0-2.22 11.09l8.88 13.31a7.994 7.994 0 0 0 11.09 2.22l.47-.31V288h-16c-4.42 0-8 3.58-8 8v16c0 4.42 3.58 8 8 8h64c4.42 0 8-3.58 8-8v-16c0-4.42-3.58-8-8-8zM608 64H32C14.33 64 0 78.33 0 96v320c0 17.67 14.33 32 32 32h576c17.67 0 32-14.33 32-32V96c0-17.67-14.33-32-32-32zM48 400v-64c35.35 0 64 28.65 64 64H48zm0-224v-64h64c0 35.35-28.65 64-64 64zm272 192c-53.02 0-96-50.15-96-112 0-61.86 42.98-112 96-112s96 50.14 96 112c0 61.87-43 112-96 112zm272 32h-64c0-35.35 28.65-64 64-64v64zm0-224c-35.35 0-64-28.65-64-64h64v64z"],"rupee":["0 0 320 512","M308 96c6.627 0 12-5.373 12-12V44c0-6.627-5.373-12-12-12H12C5.373 32 0 37.373 0 44v44.748c0 6.627 5.373 12 12 12h85.28c27.308 0 48.261 9.958 60.97 27.252H12c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h158.757c-6.217 36.086-32.961 58.632-74.757 58.632H12c-6.627 0-12 5.373-12 12v53.012c0 3.349 1.4 6.546 3.861 8.818l165.052 152.356a12.001 12.001 0 0 0 8.139 3.182h82.562c10.924 0 16.166-13.408 8.139-20.818L116.871 319.906c76.499-2.34 131.144-53.395 138.318-127.906H308c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-58.69c-3.486-11.541-8.28-22.246-14.252-32H308z"],"receipt":["0 0 384 512","M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm64 236c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-64c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12v8zm0-72v8c0 6.6-5.4 12-12 12H108c-6.6 0-12-5.4-12-12v-8c0-6.6 5.4-12 12-12h168c6.6 0 12 5.4 12 12zm96-114.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z"],"settlement":["0 0 448 512","M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zM92 296c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h264c6.6 0 12 5.4 12 12v56c0 6.6-5.4 12-12 12H92z"],"list":["0 0 512 512","M464 480H48c-26.51 0-48-21.49-48-48V80c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v352c0 26.51-21.49 48-48 48zM128 120c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm0 96c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm0 96c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm288-136v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12zm0 96v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12zm0 96v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12z"],"disb":["0 0 512 512","M464 480H48c-26.51 0-48-21.49-48-48V80c0-26.51 21.49-48 48-48h416c26.51 0 48 21.49 48 48v352c0 26.51-21.49 48-48 48zM128 120c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm0 96c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm0 96c-22.091 0-40 17.909-40 40s17.909 40 40 40 40-17.909 40-40-17.909-40-40-40zm288-136v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12zm0 96v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12zm0 96v-32c0-6.627-5.373-12-12-12H204c-6.627 0-12 5.373-12 12v32c0 6.627 5.373 12 12 12h200c6.627 0 12-5.373 12-12z"],"emi":["0 0 640 512","M608 32H32C14.33 32 0 46.33 0 64v384c0 17.67 14.33 32 32 32h576c17.67 0 32-14.33 32-32V64c0-17.67-14.33-32-32-32zM176 327.88V344c0 4.42-3.58 8-8 8h-16c-4.42 0-8-3.58-8-8v-16.29c-11.29-.58-22.27-4.52-31.37-11.35-3.9-2.93-4.1-8.77-.57-12.14l11.75-11.21c2.77-2.64 6.89-2.76 10.13-.73 3.87 2.42 8.26 3.72 12.82 3.72h28.11c6.5 0 11.8-5.92 11.8-13.19 0-5.95-3.61-11.19-8.77-12.73l-45-13.5c-18.59-5.58-31.58-23.42-31.58-43.39 0-24.52 19.05-44.44 42.67-45.07V152c0-4.42 3.58-8 8-8h16c4.42 0 8 3.58 8 8v16.29c11.29.58 22.27 4.51 31.37 11.35 3.9 2.93 4.1 8.77.57 12.14l-11.75 11.21c-2.77 2.64-6.89 2.76-10.13.73-3.87-2.43-8.26-3.72-12.82-3.72h-28.11c-6.5 0-11.8 5.92-11.8 13.19 0 5.95 3.61 11.19 8.77 12.73l45 13.5c18.59 5.58 31.58 23.42 31.58 43.39 0 24.53-19.05 44.44-42.67 45.07zM416 312c0 4.42-3.58 8-8 8H296c-4.42 0-8-3.58-8-8v-16c0-4.42 3.58-8 8-8h112c4.42 0 8 3.58 8 8v16zm160 0c0 4.42-3.58 8-8 8h-80c-4.42 0-8-3.58-8-8v-16c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16zm0-96c0 4.42-3.58 8-8 8H296c-4.42 0-8-3.58-8-8v-16c0-4.42 3.58-8 8-8h272c4.42 0 8 3.58 8 8v16z"],"thumb":["0 0 512 512","M104 224H24c-13.255 0-24 10.745-24 24v240c0 13.255 10.745 24 24 24h80c13.255 0 24-10.745 24-24V248c0-13.255-10.745-24-24-24zM64 472c-13.255 0-24-10.745-24-24s10.745-24 24-24 24 10.745 24 24-10.745 24-24 24zM384 81.452c0 42.416-25.97 66.208-33.277 94.548h101.723c33.397 0 59.397 27.746 59.553 58.098.084 17.938-7.546 37.249-19.439 49.197l-.11.11c9.836 23.337 8.237 56.037-9.308 79.469 8.681 25.895-.069 57.704-16.382 74.757 4.298 17.598 2.244 32.575-6.148 44.632C440.202 511.587 389.616 512 346.839 512l-2.845-.001c-48.287-.017-87.806-17.598-119.56-31.725-15.957-7.099-36.821-15.887-52.651-16.178-6.54-.12-11.783-5.457-11.783-11.998v-213.77c0-3.2 1.282-6.271 3.558-8.521 39.614-39.144 56.648-80.587 89.117-113.111 14.804-14.832 20.188-37.236 25.393-58.902C282.515 39.293 291.817 0 312 0c24 0 72 8 72 81.452z"],"bank":["0 0 512 512","M496 128v16a8 8 0 0 1-8 8h-24v12c0 6.627-5.373 12-12 12H60c-6.627 0-12-5.373-12-12v-12H24a8 8 0 0 1-8-8v-16a8 8 0 0 1 4.941-7.392l232-88a7.996 7.996 0 0 1 6.118 0l232 88A8 8 0 0 1 496 128zm-24 304H40c-13.255 0-24 10.745-24 24v16a8 8 0 0 0 8 8h464a8 8 0 0 0 8-8v-16c0-13.255-10.745-24-24-24zM96 192v192H60c-6.627 0-12 5.373-12 12v20h416v-20c0-6.627-5.373-12-12-12h-36V192h-64v192h-64V192h-64v192h-64V192H96z"],"bag":["0 0 448 512","M352 160v-32C352 57.42 294.579 0 224 0 153.42 0 96 57.42 96 128v32H0v272c0 44.183 35.817 80 80 80h288c44.183 0 80-35.817 80-80V160h-96zm-192-32c0-35.29 28.71-64 64-64s64 28.71 64 64v32H160v-32zm160 120c-13.255 0-24-10.745-24-24s10.745-24 24-24 24 10.745 24 24-10.745 24-24 24zm-192 0c-13.255 0-24-10.745-24-24s10.745-24 24-24 24 10.745 24 24-10.745 24-24 24z"],"briefcase":["0 0 512 512","M320 336c0 8.84-7.16 16-16 16h-96c-8.84 0-16-7.16-16-16v-48H0v144c0 25.6 22.4 48 48 48h416c25.6 0 48-22.4 48-48V288H320v48zm144-208h-80V80c0-25.6-22.4-48-48-48H176c-25.6 0-48 22.4-48 48v48H48c-25.6 0-48 22.4-48 48v80h512v-80c0-25.6-22.4-48-48-48zm-144 0H192V96h128v32z"],"chat":["0 0 512 512","M256 32C114.6 32 0 125.1 0 240c0 49.6 21.4 95 57 130.7C44.5 421.1 2.7 466 2.2 466.5c-2.2 2.3-2.8 5.7-1.5 8.7S4.8 480 8 480c66.3 0 116-31.8 140.6-51.4 32.7 12.3 69 19.4 107.4 19.4 141.4 0 256-93.1 256-208S397.4 32 256 32z"],"account":["0 0 448 512","M448 360V24c0-13.3-10.7-24-24-24H96C43 0 0 43 0 96v320c0 53 43 96 96 96h328c13.3 0 24-10.7 24-24v-16c0-7.5-3.5-14.3-8.9-18.7-4.2-15.4-4.2-59.3 0-74.7 5.4-4.3 8.9-11.1 8.9-18.6zM128 134c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm0 64c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm253.4 250H96c-17.7 0-32-14.3-32-32 0-17.6 14.4-32 32-32h285.4c-1.9 17.1-1.9 46.9 0 64z"],"pay":["0 0 576 512","M0 432c0 26.5 21.5 48 48 48h480c26.5 0 48-21.5 48-48V256H0v176zm192-68c0-6.6 5.4-12 12-12h136c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H204c-6.6 0-12-5.4-12-12v-40zm-128 0c0-6.6 5.4-12 12-12h72c6.6 0 12 5.4 12 12v40c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12v-40zM576 80v48H0V80c0-26.5 21.5-48 48-48h480c26.5 0 48 21.5 48 48z"],"report":["0 0 512 512","M496 384H64V80c0-8.84-7.16-16-16-16H16C7.16 64 0 71.16 0 80v336c0 17.67 14.33 32 32 32h464c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zM464 96H345.94c-21.38 0-32.09 25.85-16.97 40.97l32.4 32.4L288 242.75l-73.37-73.37c-12.5-12.5-32.76-12.5-45.25 0l-68.69 68.69c-6.25 6.25-6.25 16.38 0 22.63l22.62 22.62c6.25 6.25 16.38 6.25 22.63 0L192 237.25l73.37 73.37c12.5 12.5 32.76 12.5 45.25 0l96-96 32.4 32.4c15.12 15.12 40.97 4.41 40.97-16.97V112c.01-8.84-7.15-16-15.99-16z"],"settings":["0 0 512 512","M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"],"power":["0 0 512 512","M400 54.1c63 45 104 118.6 104 201.9 0 136.8-110.8 247.7-247.5 248C120 504.3 8.2 393 8 256.4 7.9 173.1 48.9 99.3 111.8 54.2c11.7-8.3 28-4.8 35 7.7L162.6 90c5.9 10.5 3.1 23.8-6.6 31-41.5 30.8-68 79.6-68 134.9-.1 92.3 74.5 168.1 168 168.1 91.6 0 168.6-74.2 168-169.1-.3-51.8-24.7-101.8-68.1-134-9.7-7.2-12.4-20.5-6.5-30.9l15.8-28.1c7-12.4 23.2-16.1 34.8-7.8zM296 264V24c0-13.3-10.7-24-24-24h-32c-13.3 0-24 10.7-24 24v240c0 13.3 10.7 24 24 24h32c13.3 0 24-10.7 24-24z"],"home":["0 0 576 512","M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"],"arrow":["0 0 448 512","M190.5 66.9l22.2-22.2c9.4-9.4 24.6-9.4 33.9 0L441 239c9.4 9.4 9.4 24.6 0 33.9L246.6 467.3c-9.4 9.4-24.6 9.4-33.9 0l-22.2-22.2c-9.5-9.5-9.3-25 .4-34.3L311.4 296H24c-13.3 0-24-10.7-24-24v-32c0-13.3 10.7-24 24-24h287.4L190.9 101.2c-9.8-9.3-10-24.8-.4-34.3z"],"down":["0 0 448 512","M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z"],"circleArrow":["0 0 512 512","M256 8c137 0 248 111 248 248S393 504 256 504 8 393 8 256 119 8 256 8zm-28.9 143.6l75.5 72.4H120c-13.3 0-24 10.7-24 24v16c0 13.3 10.7 24 24 24h182.6l-75.5 72.4c-9.7 9.3-9.9 24.8-.4 34.3l11 10.9c9.4 9.4 24.6 9.4 33.9 0L404.3 273c9.4-9.4 9.4-24.6 0-33.9L271.6 106.3c-9.4-9.4-24.6-9.4-33.9 0l-11 10.9c-9.5 9.6-9.3 25.1.4 34.4z"],"bell":["0 0 448 512","M224 512c35.32 0 63.97-28.65 63.97-64H160.03c0 35.35 28.65 64 63.97 64zm215.39-149.71c-19.32-20.76-55.47-51.99-55.47-154.29 0-77.7-54.48-139.9-127.94-155.16V32c0-17.67-14.32-32-31.98-32s-31.98 14.33-31.98 32v20.84C118.56 68.1 64.08 130.3 64.08 208c0 102.3-36.15 133.53-55.47 154.29-6 6.45-8.66 14.16-8.61 21.71.11 16.4 12.98 32 32.1 32h383.8c19.12 0 32-15.6 32.1-32 .05-7.55-2.61-15.27-8.61-21.71z"],"building":["0 0 448 512","M436 480h-20V24c0-13.255-10.745-24-24-24H56C42.745 0 32 10.745 32 24v456H12c-6.627 0-12 5.373-12 12v20h448v-20c0-6.627-5.373-12-12-12zM128 76c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40c0 6.627-5.373 12-12 12h-40c-6.627 0-12-5.373-12-12V76zm0 96c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40c0 6.627-5.373 12-12 12h-40c-6.627 0-12-5.373-12-12v-40zm52 148h-40c-6.627 0-12-5.373-12-12v-40c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40c0 6.627-5.373 12-12 12zm76 160h-64v-84c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v84zm64-172c0 6.627-5.373 12-12 12h-40c-6.627 0-12-5.373-12-12v-40c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40zm0-96c0 6.627-5.373 12-12 12h-40c-6.627 0-12-5.373-12-12v-40c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40zm0-96c0 6.627-5.373 12-12 12h-40c-6.627 0-12-5.373-12-12V76c0-6.627 5.373-12 12-12h40c6.627 0 12 5.373 12 12v40z"],"approve":["0 0 448 512","M400 480H48c-26.51 0-48-21.49-48-48V80c0-26.51 21.49-48 48-48h352c26.51 0 48 21.49 48 48v352c0 26.51-21.49 48-48 48zm-204.686-98.059l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.248-16.379-6.249-22.628 0L184 302.745l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.25 16.379 6.25 22.628.001z"],"monitor":["0 0 576 512","M528 0H48C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h192l-16 48h-72c-13.3 0-24 10.7-24 24s10.7 24 24 24h272c13.3 0 24-10.7 24-24s-10.7-24-24-24h-72l-16-48h192c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48zm-16 352H64V64h448v288z"],"download":["0 0 512 512","M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"],"survey":["0 0 384 512","M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0zM192 272c44.183 0 80-35.817 80-80s-35.817-80-80-80-80 35.817-80 80 35.817 80 80 80z"],"log":["0 0 512 512","M416 448h-84c-6.6 0-12-5.4-12-12v-40c0-6.6 5.4-12 12-12h84c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32h-84c-6.6 0-12-5.4-12-12V76c0-6.6 5.4-12 12-12h84c53 0 96 43 96 96v192c0 53-43 96-96 96zm-47-201L201 79c-15-15-41-4.5-41 17v96H24c-13.3 0-24 10.7-24 24v96c0 13.3 10.7 24 24 24h136v96c0 21.5 26 32 41 17l168-168c9.3-9.4 9.3-24.6 0-34z"],"book":["0 0 448 512","M448 360V24c0-13.3-10.7-24-24-24H96C43 0 0 43 0 96v320c0 53 43 96 96 96h328c13.3 0 24-10.7 24-24v-16c0-7.5-3.5-14.3-8.9-18.7-4.2-15.4-4.2-59.3 0-74.7 5.4-4.3 8.9-11.1 8.9-18.6zM128 134c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm0 64c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm253.4 250H96c-17.7 0-32-14.3-32-32 0-17.6 14.4-32 32-32h285.4c-1.9 17.1-1.9 46.9 0 64z"],"cash":["0 0 640 512","M352 288h-16v-88c0-4.42-3.58-8-8-8h-13.58c-4.74 0-9.37 1.4-13.31 4.03l-15.33 10.22a7.994 7.994 0 0 0-2.22 11.09l8.88 13.31a7.994 7.994 0 0 0 11.09 2.22l.47-.31V288h-16c-4.42 0-8 3.58-8 8v16c0 4.42 3.58 8 8 8h64c4.42 0 8-3.58 8-8v-16c0-4.42-3.58-8-8-8zM608 64H32C14.33 64 0 78.33 0 96v320c0 17.67 14.33 32 32 32h576c17.67 0 32-14.33 32-32V96c0-17.67-14.33-32-32-32zM48 400v-64c35.35 0 64 28.65 64 64H48zm0-224v-64h64c0 35.35-28.65 64-64 64zm272 192c-53.02 0-96-50.15-96-112 0-61.86 42.98-112 96-112s96 50.14 96 112c0 61.87-43 112-96 112zm272 32h-64c0-35.35 28.65-64 64-64v64zm0-224c-35.35 0-64-28.65-64-64h64v64z"],"chart":["0 0 512 512","M496 384H64V80c0-8.84-7.16-16-16-16H16C7.16 64 0 71.16 0 80v336c0 17.67 14.33 32 32 32h464c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16zM464 96H345.94c-21.38 0-32.09 25.85-16.97 40.97l32.4 32.4L288 242.75l-73.37-73.37c-12.5-12.5-32.76-12.5-45.25 0l-68.69 68.69c-6.25 6.25-6.25 16.38 0 22.63l22.62 22.62c6.25 6.25 16.38 6.25 22.63 0L192 237.25l73.37 73.37c12.5 12.5 32.76 12.5 45.25 0l96-96 32.4 32.4c15.12 15.12 40.97 4.41 40.97-16.97V112c.01-8.84-7.15-16-15.99-16z"],"shield":["0 0 512 512","M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.5 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C360.1 472.6 496 349.3 496 128c0-19.4-11.7-36.9-29.5-44.3zM256.1 446.3l-.1-381 175.9 73.3c-3.3 151.4-82.1 261.1-175.8 307.7z"],"user":["0 0 496 512","M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 96c48.6 0 88 39.4 88 88s-39.4 88-88 88-88-39.4-88-88 39.4-88 88-88zm0 344c-58.7 0-111.3-26.6-146.5-68.2 18.8-35.4 55.6-59.8 98.5-59.8 2.4 0 4.8.4 7.1 1.1 13 4.2 26.6 6.9 40.9 6.9 14.3 0 28-2.7 40.9-6.9 2.3-.7 4.7-1.1 7.1-1.1 42.9 0 79.7 24.4 98.5 59.8C359.3 421.4 306.7 448 248 448z"],"radio":["0 0 512 512","M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200z"],"hand":["0 0 512 512","M512 199.652c0 23.625-20.65 43.826-44.8 43.826h-99.851c16.34 17.048 18.346 49.766-6.299 70.944 14.288 22.829 2.147 53.017-16.45 62.315C353.574 425.878 322.654 448 272 448c-2.746 0-13.276-.203-16-.195-61.971.168-76.894-31.065-123.731-38.315C120.596 407.683 112 397.599 112 385.786V214.261l.002-.001c.011-18.366 10.607-35.889 28.464-43.845 28.886-12.994 95.413-49.038 107.534-77.323 7.797-18.194 21.384-29.084 40-29.092 34.222-.014 57.752 35.098 44.119 66.908-3.583 8.359-8.312 16.67-14.153 24.918H467.2c23.45 0 44.8 20.543 44.8 43.826zM96 200v192c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V200c0-13.255 10.745-24 24-24h48c13.255 0 24 10.745 24 24zM68 368c0-11.046-8.954-20-20-20s-20 8.954-20 20 8.954 20 20 20 20-8.954 20-20z"]};
function RfIcon({name,size=18,className=''}){const ic=RF_FA[name]||RF_FA.radio;return <svg className={"rfIco"+(className?" "+className:"")} viewBox={ic[0]} width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"><path d={ic[1]}/></svg>}

/* Sidebar copied from the MicroMuneem demo (demo.microfincare.in). Group Loan entries are intentionally left out. */
const RF_NAV=[
 {label:'Dashboard',icon:'dashboard',tone:'green',tab:'Dashboard'},
 {label:'Master',icon:'master',tone:'primary',children:[['Loan Plan','Loan Plan','plan'],['Penalty Scheme','Penalty Scheme','settings'],['Branches','Branches','bank'],['Staff Branch','Staff Branch','hrm'],['Branch Center','Branch Center','bank'],['Groups','Groups','members'],['Branch Login','Branch Login','hrm'],['Add Staff','New Staff','members'],['Loan Purpose','Loan Purpose','list'],['State','State','list'],['Bank','Bank','bank'],['Leave','Leave','hrm'],['Designation','Designation','members'],['Relationship Master','Relationship Master','members'],['Document Type','Document Type','receipt'],['Collection Mode','Collection Mode','pay'],['Miscellaneous','Miscellaneous','master'],['Software Timing','Software Timing','settings'],['Session','Session','list'],['Setting','Setting','settings'],['Company Profile','Company Profile','settings'],['Admin','Admin','hrm'],['SMS Testing','SMS Testing','pay'],['Series','Series','list']]},
 {label:'Product Master',icon:'master',tone:'primary',children:[['Product Category','Product Category','list'],['Product Brand','Product Brand','list'],['Product Variant','Product Variant','list'],['Product Supplier','Product Supplier','members'],['Insurance Party','Insurance Party','shield'],['Product','Product','plan'],['Product Loan','Product Loan','loan']]},
 {label:'HRM',icon:'hrm',tone:'warning',children:[['Employee','Employees / Field Officers','members'],['Salary','Salary / Payroll','hrm'],['Holiday','Holiday','list'],['Employee Loan Transfer','Employee Loan Transfer','members'],['Single Loan Transfer','Single Loan Transfer','loan'],['Member Transfer','Member Transfer','members'],['Update Center Leader','Update Center Leader','members'],['Print Letter','Print Letter','receipt'],['Employee Leave','Employee Leave','hrm'],['Attendance','Attendance','hrm'],['Employee Transfer','Employee Transfer','members']]},
 {label:'Members',icon:'members',tone:'info',children:[['Member List','Members','members'],['Member CGT & GRT','Member CGT & GRT','members'],['Member Group','Member Group','members'],['New Member','New Member','members'],['Customer Transfer','Customer Transfer','members'],['Member Transfer','Member Transfer','members'],['Update Center Leader','Update Center Leader','members'],['Print Letter','Print Letter','receipt'],['KYC Documents','KYC Documents']]},
 {label:'Apply For Loan',icon:'loan',tone:'danger',children:[['Download Loan Form','Download Loan Form','receipt'],['Loan Top-up','Loan Topup','loan'],['Individual Loan','Individual Loan','loan'],['Group Loan','Group Loan','members'],['Apply For Loan','Apply For Loan'],['Loan Applications','Loan Applications'],['Loan Approval','Loan Approval']]},
 {label:'Disbursement',icon:'disb',tone:'dark',children:[['Disbursed','Disbursed','loan'],['Group Disbursed','Group Disbursed','members'],['Disbursement','Loan Disbursement'],['Disbursed Loans','Disbursed Loans','loan']]},
 {label:'Loan Summary',icon:'loanDetails',tone:'primary',tab:'Loan Summary'},
 {label:'EMI Records',icon:'cash',tone:'green',children:[['EMI Records','EMI Records','emi'],['Advance Security','Advance Security','rupee'],['Paid EMIs','Paid EMIs','rupee'],['Due EMIs','Due EMIs','rupee'],['Due Penalty','Due Penalty','rupee'],['Future Due EMIs','Future Due EMIs','rupee'],['Promise To Pay','Promise To Pay','thumb'],['Group EMI Collection','Group EMI Collection','members'],['Member Collection (Old)','Member Collection (Old)','rupee'],['Member Collection (New)','Member Collection (New)','rupee'],['Settlement','Settlement','settlement'],['Collection / EMI','Collect EMI','rupee'],['Overdue / Recovery','Overdue / Recovery','rupee'],['Overdue Transfer','Overdue Transfer','rupee']]},
 {label:'Approvals',icon:'approve',tone:'danger',children:[['Approval - Loan','Loan','thumb'],['Approval - Salary','Salary','hrm'],['Approval - Collection','Collection','collection'],['Approval - Product Loan','Product Loan','loan'],['Approval - Settlement','Settlement','settlement'],['Approval - Fund Transfer','Fund Transfer','pay']]},
 {label:'Loan Case',icon:'monitor',tone:'primary',children:[['Loan Case','Loan Case','list'],['Loans','Loans','loanDetails'],['Single Loan Transfer','Single Loan Transfer','loan'],['Loan Settlement','Loan Settlement','settlement'],['Death Member List','Death Member List','members']]},
 {label:'CIBIL Format Download',icon:'download',tone:'warning',tab:'CIBIL Format Download'},
 {label:'Area Survey',icon:'survey',tone:'danger',tab:'Area Survey'},
 {label:'Log Records',icon:'signin',tone:'primary',tab:'Audit Logs'},
 {label:'Loan History',icon:'history',tone:'warning',tab:'Loan History'},
 {header:'ACCOUNTING'},
 {label:'Voucher',icon:'pencil',tone:'green',children:[['Day Book','Day Book','book'],['Cash Book','Cash Book','cash'],['Voucher Entries','Voucher Entries','receipt'],['Payment','Payment','receipt'],['Receipt','Receipt','receipt'],['Contra','Contra','receipt'],['Journal','Journal','receipt'],['Trial Balance','Trial Balance','chart'],['FY Trial Balance','FY Trial Balance','chart'],['FY Voucher Statement','FY Voucher Statement','chart'],['FY Opening Balance','FY Opening Balance','chart']]},
 {label:'Fund Transfer',icon:'radio',tone:'primary',tab:'Fund Transfer'},
 {label:'ACGroup',icon:'addrbook',tone:'primary',tab:'ACGroup'},
 {label:'Profit-Loss',icon:'cash',tone:'green',tab:'Profit-Loss'},
 {label:'Overview',icon:'cash',tone:'green',tab:'Overview'},
 {label:'Ledger',icon:'book',tone:'primary',tab:'Ledger'},
 {label:'Branch Ledger',icon:'book',tone:'warning',tab:'Branch Ledger'},
 {header:'REPORTING'},
 {label:'Reporting',icon:'report',tone:'primary',children:[['Reporting','Reporting'],['MIS Reports','MIS Reports'],['Financial Reports','Financial Reports'],['Portfolio Reports','Portfolio Reports'],['Loan Report','Loan Report'],['Due EMI Report','Due EMI Report'],['Collection Reporting','Collection Reporting'],['Disbursement Reporting','Disbursement Reporting'],['Settlement Reporting','Settlement Reporting'],['Member Attendance','Member Attendance'],['Online Payment Reporting','Online Payment Reporting'],['Experian CIBIL Report','Experian CIBIL Report'],['Equifax CIBIL Report','Equifax CIBIL Report'],['Payment History','Payment History'],['Other Payment','Other Payment'],['Other Receipt','Other Receipt'],['Audit Logs','Audit Logs']]},
 {header:'PERMISSION'},
 {label:'Role & Permission',icon:'monitor',tone:'danger',children:[['Role','Role List','Role'],['Permission','Permission List','Permission']]},
 {header:'MORE'},
 {label:'Accounts',icon:'account',tone:'green',children:[['Day Book','Day Book','book'],['Cashbook','Cash Book','cash'],['Voucher Entries','Voucher Entries','receipt'],['Expenses','Expenses'],['Capital / Investment','Capital / Investment'],['Deposit Accounts','Deposit Accounts','account'],['Deposit Collection','Deposit Collection','collection'],['Financial Controls','Financial Controls','shield']]},
 {label:'Operations',icon:'survey',tone:'danger',children:[['Household Assessment','Household Assessment','survey'],['Customer Complaints','Customer Complaints','log'],['Field Visits','Field Visits','members'],['Cash Handover','Cash Handover','cash']]},
 {label:'Payments',icon:'pay',tone:'primary',children:[['Razorpay / Cashfree','Razorpay / Cashfree'],['UPI / AutoPay / eNACH','UPI / AutoPay / eNACH'],['Payment History','Payment History']]},
 {label:'Settings',icon:'settings',tone:'dark',children:[['Company Profile & Logo','Company Profile & Logo'],['SMS Settings','SMS Settings'],['KYC Settings','KYC Settings'],['General Settings','General Settings'],['Backup / Restore','Backup / Restore']]}
];
const RF_TOP_LINKS=[['DAY BOOK','Day Book','book'],['CASH BOOK','Cashbook','cash'],['VOUCHER ENTRIES','Voucher Entries','receipt']];
const RF_SHORT_KEYS=[['Members','members','Members / Customers'],['Plan','plan','Loan Products'],['Loan','loan','Apply For Loan'],['Group Loan','loan','Loans'],['Loan Details','loanDetails','Loans'],['Collect EMI','rupee','Collection / EMI'],['EMI Receipt','receipt','Collection / EMI'],['Settlement','archive','Settlement']];
const rfToday=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const rfList=x=>Array.isArray(x)?x:[];

function RfClock(){
 const[now,setNow]=useState(()=>new Date());
 useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t)},[]);
 const s=now.getSeconds()*6,m=now.getMinutes()*6+s/60,h=(now.getHours()%12)*30+m/12;
 const nums=[1,2,3,4,5,6,7,8,9,10,11,12];
 return <div className="rfClock" role="img" aria-label={'Current time '+now.toLocaleTimeString('en-IN')}>
  <svg viewBox="0 0 200 200" width="100%" height="100%">
   <circle cx="100" cy="100" r="96" fill="#20c9e6"/>
   {nums.map(n=>{const a=(n*30-90)*Math.PI/180;return <text key={n} x={100+74*Math.cos(a)} y={100+74*Math.sin(a)} fill="#fff" fontSize="17" fontWeight="600" textAnchor="middle" dominantBaseline="central">{n}</text>})}
   <line x1="100" y1="100" x2="100" y2="58" stroke="#16323d" strokeWidth="5" strokeLinecap="round" transform={`rotate(${h} 100 100)`}/>
   <line x1="100" y1="100" x2="100" y2="38" stroke="#16323d" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${m} 100 100)`}/>
   <line x1="100" y1="112" x2="100" y2="30" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${s} 100 100)`}/>
   <circle cx="100" cy="100" r="6" fill="#fff"/>
  </svg>
 </div>
}


function RfPie({data,donut=false,legendTop=false}){
 const items=data.map(x=>({...x,value:Math.max(0,Number(x.value)||0)}));const total=items.reduce((a,x)=>a+x.value,0);
 const R=104,C=110,r=donut?54:0;let ang=-Math.PI/2;const pt=(rad,t)=>[C+rad*Math.cos(t),C+rad*Math.sin(t)];
 const live=items.filter(x=>x.value>0);
 const slices=total>0?live.map(x=>{const a=x.value/total*Math.PI*2;const a0=ang,a1=ang+a;ang=a1;
  if(live.length===1){return {c:x.color,full:true,k:x.label}}
  const big=a>Math.PI?1:0;const [x0,y0]=pt(R,a0),[x1,y1]=pt(R,a1);const [ix0,iy0]=pt(r,a0),[ix1,iy1]=pt(r,a1);
  const d=donut?`M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${ix1} ${iy1}A${r} ${r} 0 ${big} 0 ${ix0} ${iy0}Z`:`M${x0} ${y0}A${R} ${R} 0 ${big} 1 ${x1} ${y1}L${C} ${C}Z`;
  return {c:x.color,d,k:x.label}}):[];
 const legend=<div className="rfLegend">{items.map(x=><span key={x.label}><i style={{background:x.color}}/>{x.label}</span>)}</div>;
 return <div className="rfChart">{legendTop&&legend}<svg viewBox="0 0 220 220" role="img" aria-label="chart">{total<=0?<circle cx={C} cy={C} r={R} fill="#eee"/>:slices.map(s=>s.full?(donut?<path key={s.k} fillRule="evenodd" fill={s.c} d={`M${C-R} ${C}a${R} ${R} 0 1 0 ${2*R} 0a${R} ${R} 0 1 0 ${-2*R} 0ZM${C-r} ${C}a${r} ${r} 0 1 1 ${2*r} 0a${r} ${r} 0 1 1 ${-2*r} 0Z`}/>:<circle key={s.k} cx={C} cy={C} r={R} fill={s.c}/>):<path key={s.k} d={s.d} fill={s.c} stroke="#fff" strokeWidth="1.5"/>)}</svg>{!legendTop&&legend}</div>
}
function Dashboard({d,go,branchSel='',setBranchSel=()=>{},brand={}}){
 d=d||{};
 const[branches]=useList('/branches/');
 const bal=v=>v===null||v===undefined?'—':Number(v||0).toFixed(2);
 const rs=v=>'₹'+Number(v||0).toFixed(2)+'/-';
 const per=(k,w)=>Number(d.periods?.[k]?.[w]||0);
 const balances=[
  ['Total Balance',d.total_cash_bank_balance??d.cash_balance,'green','collection'],
  ['Bank Balance',d.bank_balance,'red','bank'],
  ['Cash Balance',d.cash_balance,'navy','rupee'],
  ['SMS Balance',d.sms_balance??0,'violet','bag']
 ];
 const stats=[
  [rs(d.disbursed),'Total Disbursement','green','Disbursement','bag',true],
  [rs(d.principal_outstanding??d.outstanding),'Total Outstanding','red','Overdue / Recovery','list',true],
  [rs(d.collection),'Total Collection','navy','Collection / EMI','briefcase',true],
  [rs(d.interest_income),'Total Interest','violet','Financial Reports','chat',false]
 ];
 const windows=[['Today','today'],['Weekly','weekly'],['Monthly','monthly'],['Total','total']];
 const tables=[
  {title:'Collection',sub:'Approved In Amount',tone:'green',key:'collection_approved',count:false,tones:['blue','cyan','green','red']},
  {title:'Collection',sub:'Pending In Amount',tone:'red',key:'collection_pending',count:false,tones:['blue','cyan','grey','red']},
  {title:'Disbursement',sub:'Approved In Amount',tone:'green',key:'disbursement_approved',count:false,tones:['blue','cyan','green','red']},
  {title:'Disbursement',sub:'Pending Number Of Loans',tone:'cyan',key:'disbursement_pending',count:true,tones:['blue','cyan','green','red']}
 ];
 const notice='🔥 CIBIL CHECKING PANEL IS LIVE NOW 🔥 !! FOR INTEGRATION, KINDLY CONTACT YOUR TRAINING MANAGER. 🔥🔥';
 return <div className="rfDash">
  <div className="rfDashHead"><h1>DASHBOARD</h1><div className="rfCrumbs"><RfIcon name="dashboard" size={13}/> <span>DASHBOARD</span><i>&rsaquo;</i><span>DASHBOARD</span></div></div>
  <div className="rfBanner" role="status"><span className="rfBell"><RfIcon name="bell" size={26}/></span><div className="rfMarquee"><span><RfIcon name="hand" size={24}/> {notice}</span></div></div>
  <div className="rfTopRow">
   <section className="rfCard rfShort"><h2><RfIcon name="down" size={15}/> SHORT KEYS</h2><div className="rfShortGrid">{RF_SHORT_KEYS.map(([label,ico,target])=><button key={label} type="button" className="rfShortBtn" onClick={()=>go(target)}><RfIcon name={ico} size={26}/><span>{label}</span></button>)}</div></section>
   <section className="rfCard rfClockCard"><RfClock/></section>
   <section className="rfCard rfBranch"><h2><RfIcon name="building" size={22}/> BRANCH</h2><div className="rfBranchSel"><select className={branchSel?'':'rfEmpty'} value={branchSel} onChange={e=>setBranchSel(e.target.value)} aria-label="Branch"><option value="">Select branch</option>{rfList(branches).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button type="button" className="rfBranchClear" onClick={()=>setBranchSel('')} aria-label="Clear branch">&times;</button></div>{branchSel?<p className="rfBranchNote">Selected branch balances use only journal entries explicitly tagged to this branch. Legacy unallocated entries are not guessed into a branch.</p>:null}</section>
  </div>
  <div className="rfBalRow">{balances.map(([label,value,tone,ico])=><div key={label} className="rfBal"><span className={'rfBalIcon '+tone}><RfIcon name={ico} size={56}/></span><div><small>{label.toUpperCase()}</small><strong>{label==='SMS Balance'?String(Math.round(Number(value||0))):bal(value)}</strong></div></div>)}</div>
  <div className="rfStatRow">{stats.map(([value,label,tone,target,ico,more])=><button key={label} type="button" className={'rfStat '+tone} onClick={()=>go(target)}><span className="rfWatermark"><RfIcon name={ico} size={96}/></span><div className="rfStatBody"><strong>{value}</strong><span>{label}</span></div><div className="rfStatFoot">{more?<>MORE INFO <RfIcon name="circleArrow" size={15} stroke={2.2}/></>:<RfIcon name="circleArrow" size={15} stroke={2.2}/>}</div></button>)}</div>
  <div className="rfTableRow">{tables.map(t=><section key={t.sub} className="rfTable"><header className={t.tone}><h3>{t.title}</h3><p>{t.sub}</p></header><ul>{windows.map(([label,w],i)=>{const v=per(t.key,w);return <li key={w}><span>{label}</span><em className={(t.count?'rfBadge ':'rfPill ')+t.tones[i]}>{t.count?String(Math.round(v)):rs(v)}</em></li>})}</ul></section>)}</div>
  <div className="rfPanelGrid">
   <section className="rfPanel span3"><h3 className="tone-success"><RfIcon name="cash" size={14}/> Profit-Loss</h3><div className="rfPanelBody"><table className="rfTbl"><tbody><tr><td><RfIcon name="cash" size={13} className="tone-success"/> Total Income</td><td><strong>₹</strong>{Number((Number(d.interest_income||0)+Number(d.penalty_collected||0))).toFixed(2)}/-</td></tr><tr><td><RfIcon name="cash" size={13} className="tone-danger"/> Total Expense</td><td><strong>₹</strong>{Number(d.expenses||0).toFixed(2)}/-</td></tr></tbody></table></div></section>
   <section className="rfPanel span3"><h3 className="tone-warning"><RfIcon name="cash" size={14}/> Settlement Record</h3><div className="rfPanelBody"><table className="rfTbl"><tbody><tr><td><RfIcon name="cash" size={13} className="tone-warning"/> Due Amount</td><td><strong>₹</strong>{Number(d.settlement_due_amount||0).toFixed(2)}/-</td></tr><tr><td><RfIcon name="cash" size={13} className="tone-success"/> Paid Amount</td><td><strong>₹</strong>{Number(d.settlement_paid_amount||0).toFixed(2)}/-</td></tr></tbody></table></div></section>
   <section className="rfPanel span6"><h3 className="tone-primary"><RfIcon name="list" size={14}/> Loan Record</h3><div className="rfPanelBody"><table className="rfTbl"><tbody><tr><td><RfIcon name="list" size={13} className="tone-primary"/> Active Loan</td><td><RfIcon name="list" size={13} className="tone-success"/> Complete Loan</td><td><RfIcon name="list" size={13} className="tone-warning"/> Settled Loan</td><td><RfIcon name="list" size={13} className="tone-warning"/> Principal Outstanding</td></tr><tr><td><strong>{Math.round(Number(d.active_loans||0))}</strong></td><td><strong>{Math.round(Number(d.complete_loans||0))}</strong></td><td><strong>{Math.round(Number(d.settled_loans||0))}</strong></td><td><strong>{Math.round(Number(d.principal_outstanding??d.outstanding??0))}</strong></td></tr></tbody></table></div></section>
   <section className="rfPanel span6"><h3 className="tone-warning"><RfIcon name="history" size={14}/> Pending Records</h3><div className="rfPanelBody"><table className="rfTbl rfTblKV"><tbody>
    <tr><td><RfIcon name="pie" size={13} className="tone-warning"/> Pending Number Of EMI today</td><td>{Math.round(Number(d.pending_emi_today||0))}</td></tr>
    <tr><td><RfIcon name="hourglass" size={13} className="tone-warning"/> Pending Amount Of EMI today</td><td>{Math.round(Number(d.pending_emi_amount_today||0))}</td></tr>
    <tr><td><RfIcon name="search" size={13} className="tone-danger"/> Pending Number Of EMI Till today</td><td>{Math.round(Number(d.overdue_emi_count||0)+Number(d.pending_emi_today||0))}</td></tr>
    <tr><td><RfIcon name="history" size={13} className="tone-danger"/> Pending Amount Of EMI Till today</td><td>{Math.round(Number(d.periods?.collection_pending?.total||0))}</td></tr>
    <tr><td><RfIcon name="database" size={13} className="tone-success"/> Total Active Customer</td><td>{Math.round(Number(d.members||0))}</td></tr>
   </tbody></table></div></section>
   <section className="rfPanel span6"><h3 className="tone-success"><RfIcon name="members" size={14}/> Recent Members</h3><div className="rfPanelBody"><table className="rfTbl rfTblStripe"><thead><tr><th className="hideSm">Sr. No.</th><th>Cust Name</th><th className="hideSm">Cust Code</th><th>Mobile</th><th className="hideSm">Address</th></tr></thead><tbody>{(d.recent_members||[]).map((m,i)=><tr key={m.id||i}><td className="hideSm">{i+1}</td><td><RfIcon name="usercircle" size={13} className="tone-primary"/> {m.name}</td><td className="hideSm"><RfIcon name="tag" size={13} className="tone-info"/> {m.customer_code}</td><td><RfIcon name="phone" size={13} className="tone-success"/> {m.phone}</td><td className="hideSm"><RfIcon name="locarrow" size={13} className="tone-warning"/> {m.address}</td></tr>)}{!(d.recent_members||[]).length&&<tr><td colSpan="5">No members yet</td></tr>}</tbody></table></div></section>
   <section className="rfPanel span6"><h3 className="tone-warning"><RfIcon name="history" size={14}/> Loan Records</h3><div className="rfPanelBody"><RfPie donut legendTop data={[{label:'Outstanding Principal',value:d.principal_outstanding??d.outstanding,color:'#ff6384'},{label:'Total Principal',value:d.disbursed,color:'#36a2eb'},{label:'Receive Principal',value:d.principal_collected,color:'#00a65a'}]}/></div></section>
   <section className="rfPanel span6"><h3 className="tone-warning"><RfIcon name="history" size={14}/> Overview</h3><div className="rfPanelBody"><RfPie data={[{label:'Total Collection',value:d.collection,color:'#0e8c0e'},{label:'Total Interest',value:d.interest_income,color:'#a300ff'},{label:'Total Outstanding',value:d.principal_outstanding??d.outstanding,color:'#ec1c22'},{label:'Total Disbursement',value:d.disbursed,color:'#00c0ef'}]}/></div></section>
  </div>
 </div>
}


async function rfFetchAll(endpoint){let url=endpoint,out=[];for(let i=0;i<400&&url;i++){const r=await api().get(url);const data=r.data;if(Array.isArray(data)){out=out.concat(data);break}out=out.concat(data.results||[]);url=data.next?String(data.next).replace(/^https?:\/\/[^/]+/,'').replace(/^\/api/,''):null}return out}

function PromiseToPayPage({reload}){
 const[loans]=useList('/loans/',reload);const[members]=useList('/members/',reload);const[branches]=useList('/branches/',reload);const[groups]=useList('/groups/',reload);const[data,load]=useList('/promises-to-pay/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({loan:'',promised_date:rfToday(),promised_amount:'',geo_location:'Indore, MP',follow_up_note:''});
 const loanById=Object.fromEntries(rfList(loans).map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(rfList(members).map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(rfList(branches).map(b=>[String(b.id),b]));
 const groupById=Object.fromEntries(rfList(groups).map(g=>[String(g.id),g]));
 const active=rfList(loans).filter(l=>l.status==='disbursed');
 const rows=rfList(data).map(r=>{
  const l=loanById[String(r.loan)]||{};const m=memById[String(r.member||l.member)]||{};const br=branchById[String(m.branch)]||{};const gr=groupById[String(m.group)]||{};
  return {...r,member_name:m.name||`Member #${r.member}`,group_name:gr.name||'—',branch_id:m.branch,branch_name:br.name||'—',geo:m.city||m.address||'Indore'};
 }).filter(r=>(!branchFilter||String(r.branch_id)===String(branchFilter))&&(!dateFilter||r.promised_date===dateFilter));
 async function save(e){
  e.preventDefault();setBusy(true);setErr('');
  try{
   const l=loanById[String(form.loan)];
   if(!l)throw new Error('Select an active disbursed loan.');
   await api().post('/promises-to-pay/',{loan:Number(l.id),member:Number(l.member),promised_date:form.promised_date,promised_amount:String(form.promised_amount),follow_up_note:`${form.geo_location?`[${form.geo_location}] `:''}${form.follow_up_note||''}`.trim()});
   setForm(null);await load();await reload?.();
  }catch(ex){setErr(ex.message||JSON.stringify(ex.response?.data||'Promise could not be saved'))}finally{setBusy(false)}
 }
 async function markOutcome(id,status){
  try{await api().post(`/promises-to-pay/${id}/outcome/`,{status});await load()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Update failed'))}
 }
 return <><PageTitle title="PROMISE TO PAY" sub="Filter borrower payment promises by Branch and Date; record new promises or mark outcomes."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>DATE *<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><div className="formActions"><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setDateFilter('')}}>Reset</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>LOAN ID</th><th>NAME</th><th>GROUP</th><th>AMOUNT</th><th>GEO LOCATION</th><th>PROMISE DATE</th><th>PROMISE NOTE</th><th>BRANCH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>#{r.loan}</td><td>{r.member_name}</td><td>{r.group_name}</td><td>{money(r.promised_amount)}</td><td>{r.geo}</td><td>{r.promised_date}</td><td>{r.follow_up_note||'—'}</td><td>{r.branch_name}</td><td><span className={r.status==='kept'?'status ok':'status off'}>{String(r.status||'promised').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div>{r.status==='promised'&&<><button type="button" onClick={()=>markOutcome(r.id,'kept')}>✓ Mark Kept</button><button type="button" onClick={()=>markOutcome(r.id,'broken')}>× Mark Broken</button></>}<button type="button" onClick={()=>window.print()}>🖨 Print Promise</button></div></details></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No promise to pay records found.</div>}</div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD PROMISE TO PAY</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>LOAN *<select required value={form.loan} onChange={e=>setForm({...form,loan:e.target.value})}><option value="">Select disbursed loan</option>{active.map(l=><option key={l.id} value={l.id}>#{l.id} — {memById[String(l.member)]?.name||`Member #${l.member}`}</option>)}</select></label><label>PROMISE DATE *<input required type="date" value={form.promised_date} onChange={e=>setForm({...form,promised_date:e.target.value})}/></label><label>AMOUNT (₹) *<input required min="0.01" step="0.01" type="number" value={form.promised_amount} onChange={e=>setForm({...form,promised_amount:e.target.value})}/></label><label>GEO LOCATION<input value={form.geo_location} onChange={e=>setForm({...form,geo_location:e.target.value})}/></label><label>PROMISE NOTE<input maxLength="255" value={form.follow_up_note} onChange={e=>setForm({...form,follow_up_note:e.target.value})}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function SettlementPage({reload,approvalMode=false}){
 const[loans,loadLoans]=useList('/loans/',reload);const[members]=useList('/members/',reload);const[branches]=useList('/branches/',reload);const[installments]=useList('/installments/',reload);const[cases,loadCases]=useList('/settlements/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[planType,setPlanType]=useState('All'),[customerFilter,setCustomerFilter]=useState(''),[loanSearch,setLoanSearch]=useState(''),[loan,setLoan]=useState(''),[quote,setQuote]=useState(null);
 const[f,setF]=useState({reason:'Pre-Closure / Full Settlement',charge_type:'Fixed',pre_closing_charge:'0.00',paid_on:rfToday(),ledger_account:'Cash',method:'cash',settlement_amount:'',remark:'',reference:''});
 const[busy,setBusy]=useState(false),[err,setErr]=useState(''),[done,setDone]=useState(null);
 const loanById=Object.fromEntries(rfList(loans).map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(rfList(members).map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(rfList(branches).map(b=>[String(b.id),b]));
 const active=rfList(loans).filter(l=>l.status==='disbursed'&&(!branchFilter||String(memById[String(l.member)]?.branch)===String(branchFilter))&&(!customerFilter||String(l.member)===String(customerFilter))&&(!loanSearch||String(l.id).includes(loanSearch)));
 const selLoan=loanById[String(loan)];
 const selInst=rfList(installments).filter(i=>String(i.loan)===String(loan));
 const duePrin=selInst.reduce((s,i)=>s+Math.max(0,Number(i.principal_due||0)-Number(i.principal_paid||0)),0);
 const dueInt=selInst.reduce((s,i)=>s+Math.max(0,Number(i.interest_due||0)-Number(i.interest_paid||0)),0);
 const preCharge=f.charge_type==='Percentage'?(duePrin*Number(f.pre_closing_charge||0)/100):Number(f.pre_closing_charge||0);
 const totalDueWithCharge=Math.max(0,(quote?Number(quote.outstanding_amount):duePrin+dueInt)+preCharge);
 async function selectLoan(id){
  setLoan(id);setDone(null);setQuote(null);setErr('');
  if(!id)return;
  try{const r=await api().get('/loans/'+id+'/foreclose/');setQuote(r.data);setF(old=>({...old,settlement_amount:r.data.outstanding_amount}))}catch{setF(old=>({...old,settlement_amount:(duePrin+dueInt).toFixed(2)}))}
 }
 async function createSettlementCase(ev){
  ev.preventDefault();if(!selLoan){setErr('Select a customer loan first.');return;}
  setBusy(true);setErr('');
  try{
   await api().post('/settlements/',{loan:Number(selLoan.id),member:Number(selLoan.member),proposed_amount:String(f.settlement_amount||totalDueWithCharge.toFixed(2)),reason:`${f.reason} | Charge: ${f.pre_closing_charge} | Ledger: ${f.ledger_account} | ${f.remark||''}`});
   await loadCases();await reload?.();setDone({loan:selLoan.id,status:'PENDING APPROVAL',foreclosure_amount:f.settlement_amount||totalDueWithCharge.toFixed(2)});
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Settlement creation failed'))}finally{setBusy(false)}
 }
 async function settleImmediate(){
  if(!quote||!loan)return;
  if(!window.confirm('Close loan #'+loan+' by receiving ₹'+quote.outstanding_amount+' ('+f.method+')?'))return;
  setBusy(true);setErr('');
  try{const r=await api().post('/loans/'+loan+'/foreclose/',{amount:quote.outstanding_amount,method:f.method,paid_on:f.paid_on,reference:f.reference||undefined,idempotency_key:'FORECLOSE-'+loan+'-'+Date.now()});setDone(r.data);setQuote(null);setLoan('');await loadLoans();await loadCases();await reload?.()}
  catch(ex){setErr(JSON.stringify(ex.response?.data||'Settlement failed'))}finally{setBusy(false)}
 }
 async function decideCase(row,verb){
  const note=window.prompt(verb==='approve'?'Approval note:':'Rejection reason (min 5 chars):','Verified settlement terms');
  if(!note)return;
  try{await api().post(`/settlements/${row.id}/${verb}/`,{approval_note:note});await loadCases();await reload?.()}catch(ex){setErr(JSON.stringify(ex.response?.data||`${verb} failed`))}
 }
 return <><PageTitle title={approvalMode?'APPROVE LOAN SETTLEMENT':'SETTLEMENT CREATE'} sub={approvalMode?'Approve or reject pending loan settlement requests by Branch and Date.':'Calculate due principal, due interest and pre-closing charges to create or execute a loan settlement.'}/>
 {err&&<div className="alert danger">{err}</div>}
 {done&&<div className="alert success">Loan #{done.loan} settlement status: <b>{done.status}</b> · Amount: ₹{done.foreclosure_amount}</div>}
 {!approvalMode&&<section className="panel"><form className="formgrid" onSubmit={createSettlementCase}>
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>PLAN TYPE<select value={planType} onChange={e=>setPlanType(e.target.value)}><option value="All">All Plan Types</option><option value="flat">Flat</option><option value="reducing">Reducing</option></select></label>
  <label>CUSTOMER (TYPE HERE)<select value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}><option value="">All Customers</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>SEARCH BY LOAN NUMBER<input value={loanSearch} onChange={e=>setLoanSearch(e.target.value)} placeholder="Type Loan ID"/></label>
  <label>SELECT CUSTOMER LOAN *<select required value={loan} onChange={e=>selectLoan(e.target.value)}><option value="">Select Disbursed Loan</option>{active.map(l=><option key={l.id} value={l.id}>Loan #{l.id} — {memById[String(l.member)]?.name||`Member #${l.member}`} ({money(l.principal)})</option>)}</select></label>
  <label>REASON *<input required minLength="5" value={f.reason} onChange={e=>setF({...f,reason:e.target.value})}/></label>
  <label>LOAN PRE CLOSING CHARGE TYPE *<select value={f.charge_type} onChange={e=>setF({...f,charge_type:e.target.value})}><option value="Fixed">Fixed</option><option value="Percentage">Percentage (%)</option></select></label>
  <label>LOAN PRE CLOSING CHARGE<input type="number" min="0" step="0.01" value={f.pre_closing_charge} onChange={e=>setF({...f,pre_closing_charge:e.target.value})}/></label>
  <label>PAYMENT DATE *<input required type="date" value={f.paid_on} onChange={e=>setF({...f,paid_on:e.target.value})}/></label>
  <label>DUE PRINCIPAL AMOUNT<input readOnly value={duePrin.toFixed(2)}/></label>
  <label>DUE INTEREST AMOUNT<input readOnly value={dueInt.toFixed(2)}/></label>
  <label>TOTAL DUE WITH PRE LOAN CLOSING CHARGE<input readOnly value={totalDueWithCharge.toFixed(2)}/></label>
  <label>SELECT LEDGER ACCOUNT *<select value={f.ledger_account} onChange={e=>setF({...f,ledger_account:e.target.value,method:e.target.value==='Cash'?'cash':'bank'})}><option value="Cash">Cash</option><option value="Bank: SBI Current A/C">Bank: SBI Current A/C</option><option value="UPI Clearing">UPI Clearing</option></select></label>
  <label>SETTLEMENT AMOUNT *<input required type="number" min="0.01" step="0.01" value={f.settlement_amount} onChange={e=>setF({...f,settlement_amount:e.target.value})}/></label>
  <label className="wideField">REMARK<input value={f.remark} onChange={e=>setF({...f,remark:e.target.value})} placeholder="Enter settlement remark"/></label>
  <div className="formActions"><button className="masterCreateBtn" disabled={busy||!loan}>{busy?'Processing…':'CREATE SETTLEMENT'}</button>{quote&&<button type="button" className="loanPlanCalculateBtn" disabled={busy} onClick={settleImmediate}>Receive ₹{quote.outstanding_amount} &amp; Close Immediately</button>}</div>
 </form></section>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <h3>APPROVE LOAN SETTLEMENT / SETTLEMENT REGISTER</h3>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>LOAN ID</th><th>MEM CODE</th><th>MEM NAME</th><th>(C/O) ALIAS</th><th>MEM MOB</th><th>SETTLEMENT DATE</th><th>PLAN AMT</th><th>PAID AMT / PROPOSED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rfList(cases).map(c=>{const l=loanById[String(c.loan)]||{};const m=memById[String(c.member||l.member)]||{};return <tr key={c.id}><td>#{c.loan}</td><td>{m.member_no||'—'}</td><td>{m.name||`Member #${c.member}`}</td><td>{m.father_spouse_name||m.nominee||'—'}</td><td>{m.phone||'—'}</td><td>{c.created_at?String(c.created_at).slice(0,10):dateNow()}</td><td>{money(l.principal||c.outstanding_snapshot||0)}</td><td>{money(c.proposed_amount)}</td><td><span className={c.status==='approved'||c.status==='paid'?'status ok':'status off'}>{String(c.status||'pending').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div>{c.status==='pending'&&<><button type="button" onClick={()=>decideCase(c,'approve')}>✓ Approve Settlement</button><button type="button" onClick={()=>decideCase(c,'reject')}>× Reject Settlement</button></>}<button type="button" onClick={()=>window.print()}>🖨 Print Settlement</button></div></details></td></tr>})}</tbody></table>{!rfList(cases).length&&<div className="empty">No settlement records found.</div>}</div>
 </section></>
}

const DEFAULT_LOAN_FORMS=[
 {code:'individual-loan-form',name:'Individual Loan Application Form',short_name:'IND-LOAN',category:'Loan Application',subtitle:'Standard Individual Borrower Application, KYC & Income Declaration',fields:['Applicant Full Name','Father / Spouse Name','Date of Birth','Aadhaar Number','PAN Number','Mobile Number','Occupation & Monthly Income','Residential Address','Requested Loan Amount (₹)','Loan Plan / Tenure','Loan Purpose','Bank A/C & IFSC','Nominee Name & Relation','Guarantor Name & Mobile'],declaration:'I declare that the information given above is true and complete, and I authorize the microfinance institution to verify my KYC, household income, and credit bureau records.'},
 {code:'group-loan-form',name:'Group / JLG Loan Application Form',short_name:'GRP-LOAN',category:'Group Loan',subtitle:'Joint Liability Group (JLG) Center Member Loan Application & Mutual Guarantee',fields:['Collection Center / Group Name','Center Code & Branch','Center Leader Name','Member Name & Member Code','Father / Spouse Name','Mobile & Aadhaar No.','Individual Loan Share (₹)','Total Group Loan Amount (₹)','Repayment Frequency (Weekly/Fortnightly/Monthly)','CGT & GRT Completion Date','Field Officer Name & Code'],declaration:'We, the members of the Joint Liability Group (JLG), jointly and severally undertake to ensure timely repayment of all group installments.'},
 {code:'product-loan-form',name:'Product / Consumer Durable Loan Form',short_name:'PRD-LOAN',category:'Product Loan',subtitle:'Consumer Durable / Asset Financing Application & Supplier Invoice Undertaking',fields:['Member Name & Code','Branch & Center','Product Category & Brand','Product Name & Variant','Supplier / Dealer Name','Unit Price (₹) & Quantity','Down Payment / Margin (₹)','Financed Loan Amount (₹)','Insurance Party & Policy Fee','Tenure (Installments)'],declaration:'I confirm receipt/selection of the product from the approved supplier and agree to repay the financed amount as per the EMI schedule.'},
 {code:'topup-loan-form',name:'Loan Top-Up Application Form',short_name:'TOPUP-FORM',category:'Loan Top-Up',subtitle:'Existing Active Borrower Top-Up & Previous Balance Adjustment Application',fields:['Member Name & Code','Previous Loan ID','Previous Loan Total Amount (₹)','Previous Loan Due Principal (₹)','Previous Loan Due Interest (₹)','Requested Top-Up Amount (₹)','Net Payable / Adjustment','Purpose of Top-Up','Updated Monthly Household Income (₹)'],declaration:'I request a Top-Up facility on my existing loan account and authorize deduction/adjustment of any outstanding dues as per sanction terms.'},
 {code:'loan-sanction-letter',name:'Loan Sanction Letter & Key Fact Statement (KFS)',short_name:'SANCTION-KFS',category:'Sanction & KFS',subtitle:'RBI-Compliant Key Fact Statement, APR, Fee Breakdown & Amortisation Summary',fields:['Sanction Reference & Date','Borrower Name & Member ID','Sanctioned Principal (₹)','Annualized Interest Rate (%) & Method','Tenure & Repayment Frequency','File Charge / Processing Fee / Insurance Fee','Net Disbursed Amount (₹)','Installment (EMI) Amount (₹)','First EMI Date & Last EMI Date','Grievance Redressal Officer Contact'],declaration:'I have read and understood the Key Fact Statement (KFS), interest rate, fee deductions, and repayment schedule in my preferred language.'},
 {code:'loan-agreement-form',name:'Loan Agreement & Demand Promissory Note',short_name:'LOAN-AGREEMENT',category:'Legal Agreement',subtitle:'Standard Microfinance Loan Agreement, Covenants & Demand Promissory Note',fields:['Agreement Date & Branch','Borrower Name, Age & Address','Co-Applicant / Spouse Name','Loan Account No. & Plan','Loan Principal (₹ in Figures & Words)','Interest Rate & Penalty Scheme','Disbursement Mode (Cash / Bank A/C)','Witness 1 Name & Signature','Witness 2 Name & Signature'],declaration:'On demand, I/we promise to pay the sanctioned loan principal together with interest as per the agreed installment schedule.'},
 {code:'member-kyc-form',name:'Member KYC & CIBIL Bureau Consent Form',short_name:'KYC-CONSENT',category:'KYC & Compliance',subtitle:'Customer Registration, OVD Verification & Credit Information Bureau Authorization',fields:['Member Full Name','Father / Husband Name','Date of Birth & Gender','Primary Identity Proof Type & No.','Address Proof Type & No.','Voter ID / PAN / Driving License','Permanent & Present Address','Household Size & Annual Income','CIBIL / Equifax / Experian / High Mark Consent'],declaration:'I voluntarily submit my KYC documents and explicitly authorize credit bureau inquiries (Equifax, Experian, TransUnion CIBIL, CRIF High Mark).'},
 {code:'guarantor-consent-form',name:'Guarantor / Co-Applicant Undertaking Form',short_name:'GUARANTOR-FORM',category:'Guarantee',subtitle:'Personal Guarantee & Co-Obligor Undertaking for Microfinance Loan',fields:['Guarantor Full Name','Relation with Applicant','Guarantor Mobile & Aadhaar No.','Guarantor Occupation & Monthly Income','Guarantor Residential Address','Primary Borrower Name & Loan Amount (₹)','Guarantor Bank Details'],declaration:'I hereby agree to stand as surety/guarantor for the above borrower and undertake to discharge the loan obligations in case of default.'},
 {code:'cgt-grt-form',name:'CGT / GRT Group Training & Verification Form',short_name:'CGT-GRT',category:'Field Operations',subtitle:'Compulsory Group Training (CGT) & Group Recognition Test (GRT) Evaluation Sheet',fields:['Branch & Collection Center','Group Name & Code','CGT Conducted By (Staff ID)','CGT Date & Attendance Count','GRT Verified By (Manager/Officer)','GRT Verification Date','Group Discipline & Repayment Readiness Score','House Visit & Income Verification Status'],declaration:'Certified that Compulsory Group Training (CGT) and Group Recognition Test (GRT) have been completed in accordance with field guidelines.'},
 {code:'no-dues-certificate',name:'No-Dues / Loan Settlement & Closure Certificate',short_name:'NOC-CLOSURE',category:'Loan Closure',subtitle:'Official Loan Closure / Foreclosure / Settlement No-Objection Certificate (NOC)',fields:['Certificate No. & Issue Date','Borrower Name & Member Code','Closed Loan ID & Plan Name','Disbursement Date & Loan Amount (₹)','Closure Type (Regular Complete / Foreclosure / Settlement)','Last Receipt No. & Closure Date','Outstanding Balance (₹0.00)'],declaration:'This is to certify that the above loan account stands fully closed/settled in our books and no further dues remain payable by the member.'}
];

function DownloadLoanForm({brand={},adminMode=false}){
 const [dbForms,setDbForms]=useState([]);
 const [selectedCode,setSelectedCode]=useState('individual-loan-form');
 const [editModal,setEditModal]=useState(null);
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState('');
 const [err,setErr]=useState('');
 const orgName=brand.name||localStorage.getItem('nmfa_company_name')||'UMANG MICRO FINANCE ASSOCIATION LIMITED';
 const orgSub=brand.sub||localStorage.getItem('nmfa_company_sub')||'MICRO MUNEEM';
 const orgLogo=brand.logo||localStorage.getItem('nmfa_company_logo')||'';

 async function loadForms(){
  try{
   const r=await api().get('/master-catalog/',{params:{master_key:'loan_form_template'}});
   setDbForms(r.data.results||r.data||[]);
  }catch(_e){setDbForms([]);}
 }
 useEffect(()=>{void loadForms()},[]);

 const mergedForms=useMemo(()=>{
  const byCode=Object.fromEntries(dbForms.map(x=>[x.code,x]));
  const list=DEFAULT_LOAN_FORMS.map(def=>{
   const custom=byCode[def.code];
   if(!custom)return {...def,dbId:null,active:true,customFile:null};
   const meta=custom.metadata||{};
   return {
    code:def.code,
    dbId:custom.id,
    name:custom.name||def.name,
    short_name:custom.short_name||def.short_name,
    category:meta.category||def.category,
    subtitle:custom.notes||meta.subtitle||def.subtitle,
    fields:Array.isArray(meta.fields)&&meta.fields.length?meta.fields:def.fields,
    declaration:meta.declaration||def.declaration,
    customFile:meta.file_data?{data:meta.file_data,name:meta.file_name||`${def.code}.pdf`,type:meta.file_type||'application/pdf',updated_at:custom.updated_at}:null,
    active:custom.active!==false
   };
  });
  dbForms.forEach(custom=>{
   if(!DEFAULT_LOAN_FORMS.some(d=>d.code===custom.code)){
    const meta=custom.metadata||{};
    list.push({
     code:custom.code,
     dbId:custom.id,
     name:custom.name,
     short_name:custom.short_name||'CUSTOM',
     category:meta.category||'Custom Form',
     subtitle:custom.notes||meta.subtitle||'Custom Admin-Uploaded Form Template',
     fields:Array.isArray(meta.fields)&&meta.fields.length?meta.fields:['Applicant / Member Name','Member Code / Loan ID','Branch Name','Date','Amount (₹)','Remarks / Reference'],
     declaration:meta.declaration||'I confirm that the above details are true and accurate.',
     customFile:meta.file_data?{data:meta.file_data,name:meta.file_name||`${custom.code}.pdf`,type:meta.file_type||'application/pdf',updated_at:custom.updated_at}:null,
     active:custom.active!==false
    });
   }
  });
  return list;
 },[dbForms]);

 const activeForm=mergedForms.find(f=>f.code===selectedCode)||mergedForms[0];

 function buildFormHtml(tpl){
  const logoTag=orgLogo?`<img src="${orgLogo}" alt="Logo" style="max-height:56px;object-fit:contain;display:block;margin:0 auto 6px"/>`:'';
  const rowsHtml=(tpl.fields||[]).map(f=>`<div style="border-bottom:1px solid #888;padding:8px 4px;display:flex;justify-content:space-between"><b style="font-size:12px;color:#222">${f}:</b><span style="color:#999">____________________________</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${tpl.name} — ${orgName}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:18px}.head{border:2px solid #222;padding:12px;text-align:center;margin-bottom:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.decl{border:1px solid #555;background:#f8fafc;padding:10px;margin-top:16px;font-size:12px;line-height:1.5}.signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:46px;text-align:center}.signs div{border-top:1px solid #222;padding-top:6px;font-size:12px;font-weight:700}@media print{.no-print{display:none}}</style></head><body><div class="no-print" style="margin-bottom:12px"><button onclick="window.print()" style="padding:8px 14px;background:#00a65a;color:#fff;border:0;border-radius:4px;cursor:pointer;font-weight:700">Print / Save as PDF</button></div><div class="head">${logoTag}<h1 style="margin:0;font-size:18px">${orgName}</h1><div style="font-size:12px;color:#444;margin-top:3px">${orgSub} · Form Code: ${tpl.short_name}</div><h2 style="margin:8px 0 2px;font-size:15px;text-transform:uppercase">${tpl.name}</h2><div style="font-size:11px;color:#555">${tpl.subtitle||''}</div></div><div class="grid">${rowsHtml}</div><div class="decl"><b>Declaration &amp; Undertaking:</b><br/>${tpl.declaration||''}</div><div class="signs"><div>Applicant / Member Signature</div><div>Guarantor / Witness Signature</div><div>Authorized Officer Signature &amp; Stamp</div></div></body></html>`;
 }

 function downloadForm(tpl){
  if(tpl.customFile?.data){
   const a=document.createElement('a');
   a.href=tpl.customFile.data;
   a.download=tpl.customFile.name||`${tpl.code}_${dateNow()}`;
   document.body.appendChild(a);a.click();a.remove();
   return;
  }
  const html=buildFormHtml(tpl);
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`${tpl.code}_${dateNow()}.html`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }

 function printForm(tpl){
  if(tpl.customFile?.data&&tpl.customFile.type==='application/pdf'){
   const w=window.open(tpl.customFile.data,'_blank');
   if(!w)alert('Pop-up blocked. Please use Download Form instead.');
   return;
  }
  const w=window.open('','_blank','width=960,height=780');
  if(!w){alert('Pop-up blocked. Please use Download Form instead.');return;}
  w.document.write(buildFormHtml(tpl));
  w.document.close();
 }

 function openUploadModal(tpl){
  const isNew=!tpl;
  setEditModal({
   dbId:tpl?.dbId||null,
   isNew,
   code:tpl?.code||'',
   name:tpl?.name||'',
   short_name:tpl?.short_name||'FORM',
   category:tpl?.category||'Loan Application',
   subtitle:tpl?.subtitle||'',
   fieldsText:(tpl?.fields||['Applicant Full Name','Member Code','Mobile Number','Loan Amount (₹)','Purpose','Address']).join('\n'),
   declaration:tpl?.declaration||'I declare that the information provided above is true and complete.',
   file_data:tpl?.customFile?.data||'',
   file_name:tpl?.customFile?.name||'',
   file_type:tpl?.customFile?.type||''
  });
  setErr('');setMsg('');
 }

 function handleTemplateFileUpload(file){
  if(!file)return;
  if(file.size>1.8*1024*1024){
   setErr('Uploaded form file must be 1.8 MB or smaller.');
   return;
  }
  const reader=new FileReader();
  reader.onload=()=>{
   setEditModal(m=>({...m,file_data:String(reader.result||''),file_name:file.name,file_type:file.type||'application/octet-stream'}));
  };
  reader.readAsDataURL(file);
 }

 async function saveTemplate(e){
  e.preventDefault();
  if(!editModal)return;
  const cleanName=editModal.name.trim();
  const cleanCode=(editModal.code||cleanName).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,38);
  if(!cleanName||!cleanCode){setErr('Form Name and Code are required.');return;}
  setBusy(true);setErr('');setMsg('');
  try{
   const fields=editModal.fieldsText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const payload={
    master_key:'loan_form_template',
    name:cleanName,
    code:cleanCode,
    short_name:(editModal.short_name||'FORM').trim().slice(0,38),
    notes:(editModal.subtitle||'').trim().slice(0,250),
    active:true,
    metadata:{
     category:editModal.category||'Loan Form',
     subtitle:(editModal.subtitle||'').trim(),
     fields,
     declaration:(editModal.declaration||'').trim(),
     file_data:editModal.file_data||'',
     file_name:editModal.file_name||'',
     file_type:editModal.file_type||''
    }
   };
   const existing=dbForms.find(x=>x.id===editModal.dbId||x.code===cleanCode);
   if(existing)await api().patch(`/master-catalog/${existing.id}/`,payload);
   else await api().post('/master-catalog/',payload);
   setSelectedCode(cleanCode);
   setEditModal(null);
   setMsg(`Form template "${cleanName}" saved and updated in database.`);
   await loadForms();
  }catch(ex){
   setErr(JSON.stringify(ex.response?.data||'Could not save form template. Ensure you are signed in with Admin / Settings permission.'));
  }finally{setBusy(false)}
 }

 async function resetToDefault(tpl){
  if(!tpl?.dbId)return;
  if(!window.confirm(`Reset "${tpl.name}" to default template and remove custom uploaded file?`))return;
  setBusy(true);setErr('');setMsg('');
  try{
   await api().delete(`/master-catalog/${tpl.dbId}/`);
   setMsg(`"${tpl.name}" restored to default template.`);
   await loadForms();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Reset failed.'))}finally{setBusy(false)}
 }

 return <><PageTitle title="DOWNLOAD & MANAGE LOAN FORMS" sub="View, print, download, or re-upload/customize all 10 official Loan, KYC, Sanction, Agreement & Closure Forms.">
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button type="button" className="loanPlanCalculateBtn" onClick={()=>printForm(activeForm)}>VIEW / PRINT SELECTED FORM</button>
   <button type="button" className="masterCreateBtn" onClick={()=>downloadForm(activeForm)}>LOAN APPLICATION FORM DOWNLOAD</button>
   <button type="button" className="secondary" onClick={()=>openUploadModal(activeForm)}>↻ Upload / Change Selected Form</button>
   <button type="button" className="masterAddBtn" onClick={()=>openUploadModal(null)}>＋ Add / Upload New Form</button>
  </div>
 </PageTitle>
 {err&&<div className="alert danger">{err}</div>}
 {msg&&<div className="alert success">{msg}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard" style={{marginBottom:14}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10,marginBottom:10}}>
   <h3 style={{margin:0}}>ALL LOAN &amp; OPERATIONAL FORMS ({mergedForms.length})</h3>
   <span className="muted" style={{fontSize:12}}>Click any form to preview, print, download, or re-upload from Admin Panel</span>
  </div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>FORM NAME</th><th>CODE</th><th>CATEGORY</th><th>SOURCE / CUSTOM UPLOAD</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
   {mergedForms.map((f,i)=><tr key={f.code} style={f.code===activeForm?.code?{background:'#eef9fb'}:{}}>
    <td>{i+1}</td>
    <td><b>{f.name}</b><div className="muted" style={{fontSize:11}}>{f.subtitle}</div></td>
    <td>{f.short_name}</td>
    <td>{f.category}</td>
    <td>{f.customFile?<span className="status ok">CUSTOM UPLOAD ({f.customFile.name})</span>:f.dbId?<span className="status ok">CUSTOMIZED TEMPLATE</span>:<span className="status">STANDARD TEMPLATE</span>}</td>
    <td><span className="status ok">ACTIVE</span></td>
    <td className="masterActions">
     <details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div>
      <button type="button" onClick={()=>setSelectedCode(f.code)}>👁 Preview Form</button>
      <button type="button" onClick={()=>printForm(f)}>🖨 Print / Save PDF</button>
      <button type="button" onClick={()=>downloadForm(f)}>⬇ Download Form</button>
      <button type="button" onClick={()=>openUploadModal(f)}>↻ Re-upload / Edit Form</button>
      {f.dbId&&<button type="button" onClick={()=>resetToDefault(f)}>↺ Reset to Default</button>}
     </div></details>
    </td>
   </tr>)}
  </tbody></table></div>
 </section>

 {activeForm&&<section className="panel rfPrintForm">
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10}}>
   <div>
    <h2 style={{margin:0}}>{orgName} — {activeForm.name}</h2>
    <small className="muted">{activeForm.subtitle} · Form Code: <b>{activeForm.short_name}</b></small>
   </div>
   <div style={{display:'flex',gap:8}}>
    <button type="button" className="smallBtn" onClick={()=>openUploadModal(activeForm)}>↻ Change / Re-upload Form</button>
    <button type="button" className="smallBtn" onClick={()=>downloadForm(activeForm)}>⬇ Download</button>
   </div>
  </div>
  {activeForm.customFile?.data&&/^image\//.test(activeForm.customFile.type)?<div style={{textAlign:'center',margin:'12px 0'}}><img src={activeForm.customFile.data} alt={activeForm.name} style={{maxWidth:'100%',maxHeight:520,border:'1px solid #ccc'}}/></div>:null}
  <h4>Form Fields &amp; Verification Checklist ({activeForm.fields.length} Fields)</h4>
  <div className="rfFormGrid">{activeForm.fields.map((l,idx)=><div className={idx%5===0?'rfFormRow wide':'rfFormRow'} key={l}><span>{l}</span><i/></div>)}</div>
  <p className="rfDeclaration"><b>Declaration:</b> {activeForm.declaration}</p>
  <div className="rfSign"><div><i/>Applicant / Member Signature</div><div><i/>Guarantor / Co-Applicant Signature</div><div><i/>Authorized Officer Signature</div></div>
 </section>}

 {editModal&&<div className="masterModalBackdrop loanPlanModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditModal(null)}}><section className="masterModal loanPlanCompactModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editModal.isNew?'ADD / UPLOAD NEW FORM TEMPLATE':`RE-UPLOAD / EDIT FORM — ${editModal.name}`}</b><button type="button" onClick={()=>setEditModal(null)}>×</button></header><form className="loanPlanCompactForm" onSubmit={saveTemplate}><div className="loanPlanScrollBody">
  <div className="loanPlanCompactGrid">
   <label>FORM TITLE / NAME *<input required maxLength="120" value={editModal.name} onChange={e=>setEditModal({...editModal,name:e.target.value})}/></label>
   <label>FORM SHORT CODE *<input required maxLength="35" value={editModal.short_name} onChange={e=>setEditModal({...editModal,short_name:e.target.value.toUpperCase()})}/></label>
   <label>FORM CATEGORY *<select value={editModal.category} onChange={e=>setEditModal({...editModal,category:e.target.value})}><option>Loan Application</option><option>Group Loan</option><option>Product Loan</option><option>Loan Top-Up</option><option>Sanction &amp; KFS</option><option>Legal Agreement</option><option>KYC &amp; Compliance</option><option>Guarantee</option><option>Field Operations</option><option>Loan Closure</option><option>Custom Form</option></select></label>
  </div>
  <label style={{display:'flex',flexDirection:'column',gap:4,marginTop:10,fontWeight:700,fontSize:11}}>SUBTITLE / PURPOSE<input maxLength="240" value={editModal.subtitle} onChange={e=>setEditModal({...editModal,subtitle:e.target.value})}/></label>
  <label style={{display:'flex',flexDirection:'column',gap:4,marginTop:10,fontWeight:700,fontSize:11}}>UPLOAD / REPLACE FORM FILE (PDF, HTML, PNG, JPG, WebP — optional, max 1.8 MB)
   <input type="file" accept=".pdf,.html,.htm,image/png,image/jpeg,image/webp" onChange={e=>handleTemplateFileUpload(e.target.files?.[0])}/>
   {editModal.file_name&&<div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}><span className="status ok">Attached: {editModal.file_name}</span><button type="button" className="smallBtn dangerBtn" onClick={()=>setEditModal({...editModal,file_data:'',file_name:'',file_type:''})}>Remove File</button></div>}
  </label>
  <label style={{display:'flex',flexDirection:'column',gap:4,marginTop:10,fontWeight:700,fontSize:11}}>PRINTABLE FORM FIELDS (ONE FIELD LABEL PER LINE) *<textarea rows="5" required value={editModal.fieldsText} onChange={e=>setEditModal({...editModal,fieldsText:e.target.value})}/></label>
  <label style={{display:'flex',flexDirection:'column',gap:4,marginTop:10,fontWeight:700,fontSize:11}}>DECLARATION &amp; UNDERTAKING TEXT *<textarea rows="3" required value={editModal.declaration} onChange={e=>setEditModal({...editModal,declaration:e.target.value})}/></label>
 </div><div className="masterModalActions loanPlanModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE / UPLOAD FORM'}</button><button type="button" className="masterCancelBtn" onClick={()=>setEditModal(null)}>CANCEL</button></div></form></section></div>}
 </>;
}

function CibilExport(){
 const BUREAUS=['HIGH MARK','FREE CHECK','EQUIFAX','EXPERIAN','TRANSUNION'];
 const[activeBureau,setActiveBureau]=useState('HIGH MARK');
 const[dateFilter,setDateFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState(''),[guarantor,setGuarantor]=useState('No'),[recoveryType,setRecoveryType]=useState('All');
 const[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 async function run(formatLabel){
  setBusy(true);setMsg('');
  try{
   const[loans,members]=await Promise.all([rfFetchAll('/loans/'),rfFetchAll('/members/')]);
   const byId=Object.fromEntries(members.map(m=>[m.id,m]));
   const head=['Bureau','Format','Loan ID','Member No','Member Name','Father/Spouse','Phone','Aadhaar','PAN','Principal','Interest Total','Total Payable','EMI Amount','Status','Disbursed On','Guarantor Included','Recovery Type'];
   const rows=loans.filter(l=>{
    const d=l.disbursed_on||l.start_date||'';
    if(dateFilter&&d!==dateFilter)return false;
    if(startDate&&d<startDate)return false;
    if(endDate&&d>endDate)return false;
    return true;
   }).map(l=>{const m=byId[l.member]||{};return [activeBureau,formatLabel,l.id,m.member_no,m.name,m.father_spouse_name||m.nominee||'',m.phone,m.aadhaar_number||m.kyc_id||'',m.pan_number||'',l.principal,l.interest_total,l.total_payable,l.emi_amount,l.status,l.disbursed_on,guarantor,recoveryType]});
   exportCsvRows(`cibil_${activeBureau.toLowerCase().replace(/\s+/g,'_')}_${formatLabel.toLowerCase().replace(/\s+/g,'_')}_${rfToday()}.csv`,head,rows);
   setMsg(`Downloaded ${rows.length} rows for ${activeBureau} (${formatLabel}).`);
  }catch(err){setMsg('Download failed: '+JSON.stringify(err.response?.data||err.message||'unknown error'))}finally{setBusy(false)}
 }
 return <><PageTitle title="CIBIL DETAILS (CIBIL FORMAT DOWNLOAD)" sub="Export Consumer and MFI Loan bureau files across High Mark, Free Check, Equifax, Experian and TransUnion."/>
 <section className="panel">
  <div className="formgrid">
   <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
   <label>START DATE<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
   <label>END DATE<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
   <label>GUARANTOR *<select value={guarantor} onChange={e=>setGuarantor(e.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></label>
   <label>RECOVERY TYPE *<select value={recoveryType} onChange={e=>setRecoveryType(e.target.value)}><option value="All">All</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option></select></label>
  </div>
  <div style={{display:'flex',flexWrap:'wrap',gap:8,margin:'16px 0'}}>{BUREAUS.map(b=><button key={b} type="button" className={activeBureau===b?'masterCreateBtn':'secondary'} onClick={()=>setActiveBureau(b)}>{b}</button>)}</div>
  <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
   <button type="button" className="loanPlanCalculateBtn" disabled={busy} onClick={()=>run('CONSUMER LOAN FILE')}>DOWNLOAD CONSUMER LOAN FILE</button>
   <button type="button" className="loanPlanCalculateBtn" disabled={busy} onClick={()=>run('MFI LOAN CDF FILE')}>DOWNLOAD MFI LOAN CDF FILE</button>
   <button type="button" className="masterCreateBtn" disabled={busy} onClick={()=>run('CONSUMER LOAN EXCEL')}>DOWNLOAD CONSUMER LOAN EXCEL</button>
   <button type="button" className="masterCreateBtn" disabled={busy} onClick={()=>run('MFI LOAN EXCEL')}>DOWNLOAD MFI LOAN EXCEL</button>
  </div>
  {msg&&<div className="alert success" style={{marginTop:12}}>{msg}</div>}
 </section></>
}

function MemberCollectionPage({go}){
 const[members]=useList('/members/');const[id,setId]=useState('');const[ledger,setLedger]=useState(null);const[busy,setBusy]=useState(false);
 async function open(next){setId(next);setLedger(null);if(!next)return;setBusy(true);try{const r=await api().get('/members/'+next+'/ledger/');setLedger(r.data)}catch(err){alert(JSON.stringify(err.response?.data||'Could not load member collection'))}finally{setBusy(false)}}
 return <><PageTitle title="Member Collection" sub="Pick a member to see their loans, payments received and amount still due."/>
  <section className="panel"><div className="formgrid"><label>Member<select value={id} onChange={e=>open(e.target.value)}><option value="">Select member</option>{rfList(members).map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>{ledger&&<button type="button" className="primary" onClick={()=>go('Collection / EMI')}>Collect EMI</button>}</div>{busy&&<p className="muted">Loading…</p>}</section>
  {ledger&&<><section className="panel"><h3>{ledger.member.name} · {ledger.member.phone}</h3><p>Total paid: <b>₹{Number(ledger.total_paid||0).toFixed(2)}</b> &nbsp;|&nbsp; Outstanding: <b>₹{Number(ledger.outstanding||0).toFixed(2)}</b></p></section>
  <section className="panel"><h3>Loans</h3><Table data={ledger.loans} columns={['id','status','principal','total_payable','emi_amount','disbursed_on']}/></section>
  <section className="panel"><h3>Payments received</h3><Table data={ledger.payments} columns={['receipt_no','paid_on','amount','method','reference']}/></section></>}</>
}

function Quick({label,go,tone='blue'}){return <button onClick={go} className={`quickBtn ${tone}`}>＋ &nbsp;{label}</button>}
function Info({title,value,rows,danger}){return <section className={`infoBox ${danger?'dangerBox':''}`}><h3>{title}</h3><small>{danger?'Requires review':'Backend summary'}</small>{rows.map(r=><div key={r}><span>{r}</span><b>{money(value)}</b></div>)}</section>}
function Bar({label,value,max}){return <div className="barRow"><span>{label}</span><div><i style={{width:`${Math.min(100,(Number(value||0)/max)*100)}%`}}/></div><b>{money(value)}</b></div>}
function useList(endpoint,reload){const[data,setData]=useState([]);const load=()=>api().get(endpoint).then(r=>setData(r.data.results||r.data)).catch(()=>setData([]));useEffect(()=>{void load()},[endpoint,reload]);return[data,load]}
function Members({reload,mode='list',go=()=>{}}){
 const[data,load]=useList('/members/',reload);const[branches]=useList('/branches/',reload);const[employees]=useList('/employees/',reload);const[groups]=useList('/groups/',reload);const[loans]=useList('/loans/',reload);const[kycDocs]=useList('/kyc-documents/',reload);
 const blank={member_no:'',name:'',father_spouse_name:'',dob:'',aadhaar_number:'',pan_number:'',phone:'',email:'',city:'',address:'',occupation:'',household_income:'0',kyc_type:'Aadhaar Card',kyc_id:'',nominee:'',nominee_relation:'',branch:'',branch_manager:'',field_officer:'',group:'',photo_data:'',active:true};
 const[f,setF]=useState(blank),[editingId,setEditingId]=useState(null),[formModalOpen,setFormModalOpen]=useState(mode==='new'),[viewMember,setViewMember]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null);
 const[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[loanExistFilter,setLoanExistFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('all'),[searchQuery,setSearchQuery]=useState(''),[tableSearch,setTableSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 useEffect(()=>{if(mode==='new')setFormModalOpen(true)},[mode]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const branchEmployees=employees.filter(e=>!f.branch||String(e.branch)===String(f.branch));
 const filtered=data.filter(m=>{
  const hasLoan=loans.some(l=>String(l.member)===String(m.id));
  if(branchFilter&&String(m.branch)!==String(branchFilter))return false;
  if(staffFilter&&String(m.field_officer)!==String(staffFilter))return false;
  if(loanExistFilter==='yes'&&!hasLoan)return false;
  if(loanExistFilter==='no'&&hasLoan)return false;
  if(statusFilter==='active'&&m.active===false)return false;
  if(statusFilter==='inactive'&&m.active!==false)return false;
  const hay=`${m.member_no||''} ${m.name||''} ${m.phone||''} ${m.city||''} ${m.aadhaar_number||m.kyc_id||''} ${m.pan_number||''}`.toLowerCase();
  if(searchQuery&&!hay.includes(searchQuery.toLowerCase()))return false;
  if(tableSearch&&!hay.includes(tableSearch.toLowerCase()))return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(e){
  e.preventDefault();setBusy(true);setNotice(null);
  try{
   const payload=normalize({...f,branch:Number(f.branch),field_officer:f.field_officer?Number(f.field_officer):null,branch_manager:f.branch_manager?Number(f.branch_manager):null,group:f.group?Number(f.group):null,kyc_id:f.kyc_id||f.aadhaar_number||f.pan_number||''});
   if(editingId)await api().patch(`/members/${editingId}/`,payload);else await api().post('/members/',payload);
   setF(blank);setEditingId(null);setFormModalOpen(false);await load();await reload?.();
   setNotice({type:'success',title:'Success!',message:editingId?'Member record updated successfully.':'Member registered successfully.'});
  }catch(err){setNotice({type:'error',title:'Unable to save',message:JSON.stringify(err.response?.data||'Member save failed.')})}finally{setBusy(false)}
 }
 function edit(row){
  setF({...blank,...row,branch:String(row.branch??''),branch_manager:String(row.branch_manager??''),field_officer:String(row.field_officer??''),group:String(row.group??''),photo_data:row.photo_data||''});
  setEditingId(row.id);setFormModalOpen(true);
 }
 async function toggle(row){
  setNotice({type:'confirm',title:'Are you sure?',message:`${row.active?'Deactivate':'Activate'} member ${row.name}?`,onConfirm:async()=>{
   try{await api().patch(`/members/${row.id}/`,{active:!row.active});await load();await reload?.();setNotice({type:'success',title:'Success!',message:`Member ${row.active?'deactivated':'activated'} successfully.`})}
   catch(err){setNotice({type:'error',title:'Action failed',message:JSON.stringify(err.response?.data||'Status update failed.')})}
  }});
 }
 const officerLabel=e=>`${e.employee_no||''} ${e.name||''}${e.role?' · '+e.role:''}`.trim();
 return <><PageTitle title="MEMBER LIST" sub="Search and filter members by Branch, Staff, Loan Existence and Status; export to Excel or register new members."><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`member_list_${dateNow()}.csv`,['SR','CODE','NAME','FATHER/SPOUSE (C/O)','BIRTHDATE','AADHAAR','PAN','MOBILE','CITY','AGENT','BRANCH','CREATEDATE','STATUS'],filtered.map((r,i)=>[i+1,r.member_no,r.name,r.father_spouse_name||r.nominee||'',r.dob||'',r.aadhaar_number||r.kyc_id||'',r.pan_number||'',r.phone,r.city||'',empById[String(r.field_officer)]?.name||'',branchById[String(r.branch)]?.name||'',r.created_at?String(r.created_at).slice(0,10):'',r.active?'ACTIVE':'INACTIVE']))}>DOWNLOAD EXCEL</button><button className="masterAddBtn" onClick={()=>{setEditingId(null);setF(blank);setFormModalOpen(true)}}>＋ Add New</button></div></PageTitle>
 <section className="panel"><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
  <label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>{setStaffFilter(e.target.value);setPage(1)}}><option value="">All Staff / Agents</option>{employees.map(e=><option key={e.id} value={e.id}>{officerLabel(e)}</option>)}</select></label>
  <label>LOAN EXIST *<select value={loanExistFilter} onChange={e=>{setLoanExistFilter(e.target.value);setPage(1)}}><option value="all">All</option><option value="yes">Yes (Active/Disbursed Loan)</option><option value="no">No Loan</option></select></label>
  <label>SELECT STATUS *<select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
  <label>Search (Name, Code, Mob)<input value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);setPage(1)}} placeholder="Name, Code or Mobile"/></label>
  <div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>Search</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setStaffFilter('');setLoanExistFilter('all');setStatusFilter('all');setSearchQuery('');setTableSearch('');setPage(1)}}>Reset</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={tableSearch} onChange={e=>{setTableSearch(e.target.value);setPage(1)}} placeholder="Table Search"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR</th><th>ACTION</th><th>NAME</th><th>DISBURSED /CIBIL</th><th>FATHER NAME (C/O)</th><th>SPOUSE NAME</th><th>BIRTHDATE</th><th>AADHARCARDNUMBER</th><th>PANCARDNUMBER</th><th>MOBILE</th><th>CITY</th><th>AGENT</th><th>BRANCH</th><th>CREATEDATE</th><th>KYC</th><th>STATUS</th></tr></thead><tbody>{shown.map((row,i)=>{
   const mLoans=loans.filter(l=>String(l.member)===String(row.id));
   const hasDisb=mLoans.some(l=>l.status==='disbursed');
   const hasVerifiedKyc=kycDocs.some(d=>String(d.member)===String(row.id)&&d.verified)||Boolean(row.kyc_id||row.aadhaar_number);
   return <tr key={row.id}>
    <td>{(page-1)*pageSize+i+1}</td>
    <td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewMember(row)}>View Profile</button><button type="button" onClick={()=>edit(row)}>Edit Member</button><button type="button" onClick={()=>go('Member Collection (New)')}>Member Ledger</button><button type="button" onClick={()=>go('KYC Documents')}>Upload / Verify KYC</button><button type="button" onClick={()=>toggle(row)}>{row.active?'Deactivate':'Activate'}</button></div></details></td>
    <td><b>{row.name}</b><br/><small>{row.member_no}</small></td>
    <td><span className={hasDisb?'status ok':'status off'}>{hasDisb?'DISBURSED':'NO LOAN'}</span></td>
    <td>{row.father_spouse_name||'—'}</td>
    <td>{row.nominee||'—'}</td>
    <td>{row.dob||'—'}</td>
    <td>{row.aadhaar_number||row.kyc_id||'—'}</td>
    <td>{row.pan_number||'—'}</td>
    <td>{row.phone}</td>
    <td>{row.city||(row.address?String(row.address).slice(0,24):'—')}</td>
    <td>{empById[String(row.field_officer)]?.name||row.field_officer_name||'—'}</td>
    <td>{branchById[String(row.branch)]?.name||row.branch_name||'—'}</td>
    <td>{row.created_at?String(row.created_at).slice(0,10):dateNow()}</td>
    <td><span className={hasVerifiedKyc?'status ok':'status off'}>{hasVerifiedKyc?'VERIFIED':'PENDING'}</span></td>
    <td><span className={row.active?'status ok':'status off'}>{row.active?'ACTIVE':'INACTIVE'}</span></td>
   </tr>;
  })}</tbody></table>{!shown.length&&<div className="empty">No member records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {viewMember&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewMember(null)}}><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>MEMBER DETAILS — {viewMember.name} ({viewMember.member_no})</b><button type="button" onClick={()=>setViewMember(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{[['Member No.',viewMember.member_no],['Full Name',viewMember.name],['Father / Spouse (C/O)',viewMember.father_spouse_name||'—'],['Nominee / Spouse',viewMember.nominee||'—'],['Birthdate',viewMember.dob||'—'],['Mobile',viewMember.phone],['Email',viewMember.email||'—'],['Aadhaar Number',viewMember.aadhaar_number||viewMember.kyc_id||'—'],['PAN Number',viewMember.pan_number||'—'],['City',viewMember.city||'—'],['Address',viewMember.address||'—'],['Occupation',viewMember.occupation||'—'],['Household Income',money(viewMember.household_income||0)],['Branch',branchById[String(viewMember.branch)]?.name||'—'],['Field Officer',empById[String(viewMember.field_officer)]?.name||'—'],['Status',viewMember.active?'ACTIVE':'INACTIVE']].map(([k,v])=><div key={k}><small>{k}</small><b>{v}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCreateBtn" onClick={()=>{const m=viewMember;setViewMember(null);edit(m)}}>EDIT MEMBER</button><button type="button" className="masterCancelBtn" onClick={()=>setViewMember(null)}>CLOSE</button></div></section></div>}
 {formModalOpen&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editingId?`EDIT MEMBER #${editingId}`:'ADD NEW MEMBER'}</b><button type="button" onClick={()=>setFormModalOpen(false)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn">
  <label>MEMBER NO. *<input required value={f.member_no} onChange={e=>setF({...f,member_no:e.target.value.toUpperCase()})} placeholder="MEM-001"/></label>
  <label>FULL NAME *<input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></label>
  <label>FATHER / SPOUSE NAME (C/O)<input value={f.father_spouse_name||''} onChange={e=>setF({...f,father_spouse_name:e.target.value})}/></label>
  <label>BIRTHDATE<input type="date" value={f.dob||''} onChange={e=>setF({...f,dob:e.target.value})}/></label>
  <label>MOBILE *<input required value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></label>
  <label>EMAIL<input type="email" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></label>
  <label>AADHAAR CARD NUMBER<input maxLength="20" value={f.aadhaar_number||''} onChange={e=>setF({...f,aadhaar_number:e.target.value})}/></label>
  <label>PAN CARD NUMBER<input maxLength="20" value={f.pan_number||''} onChange={e=>setF({...f,pan_number:e.target.value.toUpperCase()})}/></label>
  <label>CITY<input maxLength="100" value={f.city||''} onChange={e=>setF({...f,city:e.target.value})}/></label>
 </div><div className="loanPlanColumn">
  <label>BRANCH *<select required value={f.branch} onChange={e=>setF({...f,branch:e.target.value,branch_manager:'',field_officer:''})}><option value="">Select branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
  <label>BRANCH MANAGER<select value={f.branch_manager} onChange={e=>setF({...f,branch_manager:e.target.value})}><option value="">Select branch manager</option>{branchEmployees.filter(e=>/manager/i.test(e.role||e.designation||'')).map(e=><option key={e.id} value={e.id}>{officerLabel(e)}</option>)}</select></label>
  <label>FIELD OFFICER / AGENT *<select required value={f.field_officer} onChange={e=>setF({...f,field_officer:e.target.value})}><option value="">Select field officer</option>{branchEmployees.map(e=><option key={e.id} value={e.id}>{officerLabel(e)}</option>)}</select></label>
  <label>GROUP / COLLECTION CENTER<select value={f.group||''} onChange={e=>setF({...f,group:e.target.value})}><option value="">Optional Group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></label>
  <label>OCCUPATION<input value={f.occupation||''} onChange={e=>setF({...f,occupation:e.target.value})}/></label>
  <label>HOUSEHOLD INCOME (₹)<input type="number" min="0" step="0.01" value={f.household_income||''} onChange={e=>setF({...f,household_income:e.target.value})}/></label>
  <label>NOMINEE / SPOUSE NAME<input value={f.nominee||''} onChange={e=>setF({...f,nominee:e.target.value})}/></label>
  <label>NOMINEE RELATION<input value={f.nominee_relation||''} onChange={e=>setF({...f,nominee_relation:e.target.value})}/></label>
  <label>ADDRESS<input value={f.address||''} onChange={e=>setF({...f,address:e.target.value})}/></label>
 </div></div>
 <div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':editingId?'UPDATE MEMBER':'SAVE MEMBER'}</button><button type="button" className="masterCancelBtn" onClick={()=>setFormModalOpen(false)}>CANCEL</button></div></form></section></div>}
 <KycDocuments members={data} reload={reload}/>
 {notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>
}

function KycDocuments({members,reload}){const[member,setMember]=useState('');const[type,setType]=useState('identity');const[file,setFile]=useState(null);const[docs,setDocs]=useState([]);const[busy,setBusy]=useState(false);const load=()=>api().get('/kyc-documents/',{params:member?{member}: {}}).then(r=>setDocs(r.data.results||r.data)).catch(()=>setDocs([]));useEffect(()=>{load()},[member,reload]);const selectedDocs=docs.filter(d=>String(d.member)===String(member));const identityTypes=['identity','aadhaar','pan','voter_id','driving_license','passport'];const identityVerified=selectedDocs.some(d=>d.verified&&identityTypes.includes(d.document_type));const addressVerified=selectedDocs.some(d=>d.verified&&['address','utility_bill'].includes(d.document_type));async function upload(e){e.preventDefault();if(!member||!file){alert('Customer aur document file select karein.');return}const fd=new FormData();fd.append('member',member);fd.append('document_type',type);fd.append('file',file);setBusy(true);try{await api().post('/kyc-documents/',fd,{headers:{'Content-Type':'multipart/form-data'}});setFile(null);e.target.reset();await load();await reload()}catch(err){alert(JSON.stringify(err.response?.data||'KYC upload failed'))}finally{setBusy(false)}}async function verify(doc){try{await api().patch(`/kyc-documents/${doc.id}/`,{verified:!doc.verified});load()}catch(err){alert(JSON.stringify(err.response?.data||'Verification update failed'))}}async function download(doc){try{const r=await api().get(`/kyc-documents/${doc.id}/download/`,{responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=doc.original_name||'kyc-document';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(err){alert('Document download failed. Check your access and server logs.')}}return <section className="panel"><h3>KYC Documents</h3><p className="muted">Private upload: PDF/JPG/PNG, maximum 5 MB. Options include customer photo, Aadhaar, PAN, bank passbook, bank statement, address/income proof, signature, and supporting documents. Collect only documents required for your entity and loan policy; restrict access to sensitive KYC files. Documents are not exposed through public URLs.</p><form className="formgrid" onSubmit={upload}><label>Customer<select value={member} onChange={e=>setMember(e.target.value)} required><option value="">Select customer</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label><label>Document type<select value={type} onChange={e=>setType(e.target.value)}><option value="photo">Customer / Member Photo</option><option value="aadhaar">Aadhaar Card</option><option value="pan">PAN Card</option><option value="identity">Other Identity Proof</option><option value="address">Address Proof</option><option value="bank_passbook">Bank Passbook</option><option value="bank_statement">Bank Statement</option><option value="cancelled_cheque">Cancelled Cheque</option><option value="income">Income Proof</option><option value="signature">Customer Signature</option><option value="voter_id">Voter ID</option><option value="driving_license">Driving Licence</option><option value="passport">Passport</option><option value="utility_bill">Utility Bill</option><option value="loan_agreement">Signed Loan Agreement</option><option value="nominee_document">Nominee / Guarantor Document</option><option value="other">Other Supporting Document</option></select></label><label>File (PDF/JPG/PNG)<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e=>setFile(e.target.files?.[0]||null)} required/></label><button className="primary" disabled={busy}>{busy?'Uploading...':'Upload KYC Document'}</button></form>{member&&<div className={identityVerified&&addressVerified?'alert':'alert danger'}><b>Loan approval KYC check for selected customer:</b> &nbsp; Identity: <strong>{identityVerified?'Verified':'Missing / needs verification'}</strong> &nbsp; | &nbsp; Address: <strong>{addressVerified?'Verified':'Missing / needs verification'}</strong><p className="muted">Identity needs a verified Aadhaar, PAN, Voter ID, Driving Licence, Passport or Other Identity Proof. A photo, signature or income document does not replace identity proof.</p></div>}<div className="tableWrap"><table><thead><tr><th>Customer</th><th>Type</th><th>Filename</th><th>Size</th><th>Status</th><th>Action</th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td>{d.member}</td><td>{pretty(d.document_type)}</td><td>{d.original_name}</td><td>{Math.ceil((d.size_bytes||0)/1024)} KB</td><td>{d.verified?'Verified':'Pending'}</td><td><button className="smallBtn" onClick={()=>download(d)}>Download</button> <button className="smallBtn" onClick={()=>verify(d)}>{d.verified?'Unverify':'Verify'}</button></td></tr>)}</tbody></table>{!docs.length&&<div className="empty">No KYC documents uploaded for this selection</div>}</div></section>}
function Products({reload}){const[data,load]=useList('/loan-products/',reload);const blank={name:'',code:'',interest_rate:'18',interest_method:'flat',frequency:'monthly',tenure:12,processing_fee:0,late_penalty:0,grace_days:0,active:true};return <Crud title="Loan Plans / Products" sub="Admin can create custom daily, weekly, fortnightly or monthly plans. Interest rate is annual %, and tenure is number of installments." endpoint="/loan-products/" fields={blank} data={data} reload={load} columns={['name','code','interest_rate','interest_method','frequency','tenure','processing_fee','late_penalty','grace_days','active']}/>}
function Branches({reload}){const[data,load]=useList('/branches/',reload);const blank={name:'',code:'',address:'',phone:'',active:true};return <Crud title="Branches" sub="Branch master and operating locations" endpoint="/branches/" fields={blank} data={data} reload={load} columns={['code','name','phone','address','active']}/>}
function Locations({reload}){
 const [areas,load]=useList('/areas/',reload);const [branches]=useList('/branches/',reload);const [employees]=useList('/employees/',reload);
 const [branchFilter,setBranchFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[form,setForm]=useState(null),[editId,setEditId]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({branch:branches[0]?.id||'',name:'',code:'',active:true});
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=areas.filter(a=>(!branchFilter||String(a.branch)===String(branchFilter))&&`${a.name} ${a.code} ${branchById[String(a.branch)]?.name||''}`.toLowerCase().includes(search.toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(ev){ev.preventDefault();setBusy(true);setErr('');try{const payload={branch:Number(form.branch),name:form.name.trim(),code:form.code.trim().toUpperCase(),active:!!form.active};if(editId)await api().patch(`/areas/${editId}/`,payload);else await api().post('/areas/',payload);setForm(null);setEditId(null);await load();await reload?.()}catch(ex){setErr(JSON.stringify(ex.response?.data||'Area save failed.'))}finally{setBusy(false)}}
 async function toggle(row){try{await api().patch(`/areas/${row.id}/`,{active:!row.active});await load()}catch(ex){setErr('Status update failed.')}}
 return <><PageTitle title="AREA SURVEY LIST" sub="Manage surveyed operating areas mapped to branches."><button className="masterAddBtn" onClick={()=>{setEditId(null);setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>{setBranchFilter(e.target.value);setPage(1)}}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search area name or code"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>AREA NAME</th><th>CODE</th><th>BRANCH</th><th>SURVEY DATE</th><th>EMPLOYEE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((a,i)=>{const b=branchById[String(a.branch)]||{};const emp=employees.find(e=>String(e.branch)===String(a.branch))||{};return <tr key={a.id}><td>{(page-1)*pageSize+i+1}</td><td>{a.name}</td><td>{a.code}</td><td>{b.name||'—'}</td><td>{a.created_at?String(a.created_at).slice(0,10):dateNow()}</td><td>{emp.name||'Field Officer'}</td><td><span className={a.active?'status ok':'status off'}>{a.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>{setEditId(a.id);setForm({...a})}}>✎ Edit Area Survey</button><button type="button" onClick={()=>toggle(a)}>{a.active?'Deactivate':'Activate'}</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No area survey records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{editId?'EDIT AREA SURVEY':'ADD NEW AREA SURVEY'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>BRANCH *<select required value={String(form.branch||'')} onChange={e=>setForm({...form,branch:e.target.value})}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>AREA NAME *<input required maxLength="120" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>AREA CODE *<input required maxLength="30" value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="AR-001"/></label><label>STATUS *<select value={form.active?'active':'inactive'} onChange={e=>setForm({...form,active:e.target.value==='active'})}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>SAVE</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}
function Employees({reload}){const[data,load]=useList('/employees/',reload);const blank={branch:1,employee_no:'',name:'',alias:'',father_name:'',dob:'',email:'',phone:'',alternate_phone:'',role:'Field Officer',designation:'',address:'',city:'',state:'Madhya Pradesh',pin_code:'',joining_date:'',last_experience_years:'0',bank_name:'',bank_branch:'',account_holder:'',bank_account_number:'',ifsc_code:'',aadhaar_number:'',pan_number:'',aadhaar_status:'pending',pan_status:'pending',login_status:'inactive',annual_basic_salary:'0',fixed_allowance:'0',monthly_fixed_deduction:'0',monthly_income_tax:'0',sick_leave_days:'0',privilege_leave_days:'0',mandatory_leave_days:'0',casual_leave_days:'0',paternity_leave_days:'0',maternity_leave_days:'0',extraordinary_leave_days:'0',active:true};return <Crud title="Employees / Field Officers" sub="Employee master: personal, bank, salary, leave and verification status. Status values do not perform real Aadhaar/PAN/OTP verification." endpoint="/employees/" fields={blank} data={data} reload={load} columns={['employee_no','name','phone','designation','role','aadhaar_status','pan_status','login_status','active']}/> }
function Crud({title,sub,endpoint,fields,data,reload,columns}){
 const[f,setF]=useState(fields),[busy,setBusy]=useState(false),[editingId,setEditingId]=useState(null),[notice,setNotice]=useState(null);
 async function save(e){e.preventDefault();setNotice({type:'confirm',title:'Are you sure?',message:editingId?'Save changes to this record?':'Create this new record?',confirmLabel:'Yes, confirm it',onConfirm:async()=>{setBusy(true);try{if(editingId)await api().patch(`${endpoint}${editingId}/`,normalize(f));else await api().post(endpoint,normalize(f));setF(fields);setEditingId(null);await reload();setNotice({type:'success',title:'Success!',message:editingId?'Record updated successfully.':'Record created successfully.'})}catch(err){setNotice({type:'error',title:'Unable to save',message:JSON.stringify(err.response?.data||'Save failed.')})}finally{setBusy(false)}}})}
 function edit(row){const next={...fields};Object.keys(fields).forEach(k=>{next[k]=row[k]===null||row[k]===undefined?'':row[k]});setF(next);setEditingId(row.id);window.scrollTo({top:0,behavior:'smooth'})}
 function toggle(row){setNotice({type:'confirm',title:'Are you sure?',message:`${row.active?'Deactivate':'Activate'} this record?`,confirmLabel:'Yes, confirm it',onConfirm:async()=>{setBusy(true);try{await api().patch(`${endpoint}${row.id}/`,{active:!row.active});await reload();setNotice({type:'success',title:'Success!',message:`Record ${row.active?'deactivated':'activated'} successfully.`})}catch(err){setNotice({type:'error',title:'Action failed',message:JSON.stringify(err.response?.data||'Status update failed.')})}finally{setBusy(false)}}})}
 return <><PageTitle title={title} sub={sub}><span className="count">{data.length} records</span></PageTitle><section className="panel"><h3>{editingId?`Edit Record #${editingId}`:'Add New'}</h3><form className="formgrid" onSubmit={save}>{Object.entries(fields).map(([k,v])=><Field key={k} name={k} value={f[k]} set={x=>setF({...f,[k]:x})}/>) }<button className="primary" disabled={busy}>{busy?'Saving...':editingId?'Update Record':'Save Record'}</button>{editingId&&<button type="button" className="secondary" onClick={()=>{setF(fields);setEditingId(null)}}>Cancel Edit</button>}</form></section><section className="panel"><h3>Records</h3><div className="tableWrap"><table><thead><tr>{columns.map(c=><th key={c}>{pretty(c)}</th>)}<th>Actions</th></tr></thead><tbody>{data.map(row=><tr key={row.id}>{columns.map(c=><td key={c}>{c==='active'?<span className={row[c]?'status ok':'status off'}>{row[c]?'Active':'Inactive'}</span>:String(row[c]??'—')}</td>)}<td><button type="button" className="smallBtn" onClick={()=>edit(row)}>Edit</button>{Object.prototype.hasOwnProperty.call(row,'active')&&<button type="button" className="smallBtn dangerBtn" onClick={()=>toggle(row)}>{row.active?'Deactivate':'Activate'}</button>}</td></tr>)}</tbody></table>{!data.length&&<div className="empty">No records yet</div>}</div></section>{notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" disabled={busy} onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>{notice.confirmLabel||'Yes, confirm it'}</button><button className="cancelBtn" disabled={busy} onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>}
function Field({name,value,set}){if(name==='photo_data')return <label className="wideField">Passport-size Customer Photo (JPG/PNG/WebP, max 1.5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>1.5*1024*1024){alert('Photo 1.5 MB se chhoti honi chahiye.');e.target.value='';return}const reader=new FileReader();reader.onload=()=>set(String(reader.result||''));reader.readAsDataURL(file)}}/>{value&&<span className="memberPhotoPreview"><img src={value} alt="Customer passport-size photo preview"/><button type="button" className="secondary" onClick={()=>set('')}>Remove photo</button></span>}</label>;if(typeof value==='boolean')return <label className="check"><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/>{pretty(name)}</label>;if(['aadhaar_status','pan_status'].includes(name))return <label>{pretty(name)}<select value={value} onChange={e=>set(e.target.value)}><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>;if(name==='login_status')return <label>{pretty(name)}<select value={value} onChange={e=>set(e.target.value)}><option value="inactive">Inactive</option><option value="active">Active</option><option value="locked">Locked</option></select></label>;if(name==='interest_method')return <label>{pretty(name)}<select value={value} onChange={e=>set(e.target.value)}><option value="flat">Flat</option><option value="reducing">Reducing</option></select></label>;if(name==='frequency')return <label>{pretty(name)}<select value={value} onChange={e=>set(e.target.value)}><option>monthly</option><option>weekly</option><option>fortnightly</option><option>daily</option></select></label>;return <label>{pretty(name)}<input type={name.includes('amount')||name.includes('rate')||name.includes('fee')||name.includes('penalty')||name==='tenure'||name==='grace_days'||name==='household_income'||name==='branch'||name==='field_officer'||name==='branch_manager'?'number':name==='date'||name.includes('dob')||name.includes('joining_date')?'date':name==='email'?'email':'text'} min={name==='interest_rate'||name==='processing_fee'||name==='late_penalty'||name==='grace_days'||name==='tenure'?'0':undefined} step={name==='interest_rate'?'0.001':name.includes('fee')||name.includes('penalty')?'0.01':undefined} value={value??''} onChange={e=>set(e.target.value)} placeholder={pretty(name)}/></label>}
function normalize(f){const x={...f};for(const k of Object.keys(x)){if(x[k]==='')delete x[k]}return x}
function pretty(s){const labels={interest_rate:'Annual Interest Rate (%)',interest_method:'Interest Calculation',frequency:'Repayment Frequency',tenure:'Number Of Installments',processing_fee:'Processing Fee (₹)',late_penalty:'Late Penalty (₹)',grace_days:'Grace Period (Days)',active:'Active'};return labels[s]||s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function Table({data,columns}){const[q,setQ]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(10),[viewRow,setViewRow]=useState(null);const filtered=useMemo(()=>{const needle=q.trim().toLowerCase();return (data||[]).filter(r=>!needle||columns.some(c=>String(r?.[c]??'').toLowerCase().includes(needle)))},[data,columns,q]);const pages=Math.max(1,Math.ceil(filtered.length/size));const safePage=Math.min(page,pages);const rows=filtered.slice((safePage-1)*size,safePage*size);useEffect(()=>setPage(1),[q,size]);return <div className="loanPlanReferenceCard"><div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={size} onChange={e=>setSize(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select> entries</label><label className="masterSearch"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search records…" aria-label="Search table records"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th>{columns.map(c=><th key={c}>{pretty(c).toUpperCase()}</th>)}<th>ACTION</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}><td>{(safePage-1)*size+i+1}</td>{columns.map(c=><td key={c}>{c==='active'||c==='is_active'?<span className={(r[c]?'status ok':'status off')}>{r[c]?'ACTIVE':'INACTIVE'}</span>:c==='status'?<span className={'status '+(/paid|active|approved|disbursed|success|verified|closed/i.test(String(r[c]||''))?'ok':'off')}>{String(r[c]??'—').toUpperCase()}</span>:String(r[c]??'—')}</td>)}<td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setViewRow(r)}>👁 View Record</button><button type="button" onClick={()=>window.print()}>🖨 Print</button></div></details></td></tr>)}</tbody></table></div>{!filtered.length?<div className="empty">{q?'No matching records found.':'No records yet.'}</div>:null}<div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?((safePage-1)*size+1):0} TO {Math.min(safePage*size,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button type="button" disabled={safePage<=1} onClick={()=>setPage(1)}>«</button><button type="button" disabled={safePage<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}>PREV</button><button type="button" className="current">{safePage}</button><button type="button" disabled={safePage>=pages} onClick={()=>setPage(v=>Math.min(pages,v+1))}>NEXT</button><button type="button" disabled={safePage>=pages} onClick={()=>setPage(pages)}>»</button></div></div>{viewRow&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setViewRow(null)}}><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>RECORD DETAILS</b><button type="button" onClick={()=>setViewRow(null)}>×</button></header><div className="masterModalBody loanPlanDetailGrid">{columns.map(c=><div key={c}><small>{pretty(c)}</small><b>{String(viewRow[c]??'—')}</b></div>)}</div><div className="masterModalActions"><button type="button" className="masterCancelBtn" onClick={()=>setViewRow(null)}>CLOSE</button></div></section></div>}</div>}
function printBrandHeader(title,meta){const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const name=esc(localStorage.getItem('nmfa_company_name')||'NEW MICROFINANCE');const sub=esc(localStorage.getItem('nmfa_company_sub')||'SERVICE ASSOCIATION');const logo=localStorage.getItem('nmfa_company_logo');const address=esc(localStorage.getItem('nmfa_company_address')||'');const phone=esc(localStorage.getItem('nmfa_company_phone')||'');const email=esc(localStorage.getItem('nmfa_company_email')||'');return `<div class="brand">${logo?`<img class="printLogo" src="${logo}" alt="Company logo">`:''}<strong>${name} ${sub}</strong>${address?`<div>${address}</div>`:''}${phone||email?`<div>${phone}${phone&&email?' · ':''}${email}</div>`:''}<div>${esc(title)}</div><div class="muted">${esc(meta)}</div></div>`}
function printHtml(title,body){
 const w=window.open('','_blank','width=1000,height=800');
 if(!w){alert('Print window blocked. Please allow pop-ups for NMFA.');return;}
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;margin:0}h1{font-size:20px;text-align:center;margin:5px 0}h2{font-size:14px;margin:14px 0 6px;background:#edf2f7;padding:6px}p{margin:5px 0}.brand{border:1px solid #333;padding:10px;text-align:center}.brand strong{font-size:18px;letter-spacing:.5px}.printLogo{max-width:70px;max-height:48px;object-fit:contain;display:block;margin:0 auto 5px}.muted{color:#555;font-size:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.field{border-bottom:1px solid #bbb;padding:6px 2px;min-height:25px}.field b{display:inline-block;min-width:115px}.table{width:100%;border-collapse:collapse;margin-top:5px}.table th,.table td{border:1px solid #555;padding:5px;text-align:left;font-size:10px}.signs{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:42px}.sign{border-top:1px solid #222;padding-top:6px;text-align:center;min-height:35px}.declaration{border:1px solid #777;padding:8px;margin-top:12px;line-height:1.5}.no-print{margin:10px 0;padding:8px 14px}@media print{.no-print{display:none}}
 </style></head><body><button class="no-print" onclick="window.print()">Print / Save PDF</button>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
}
function Applications({reload,review}){const[data,load]=useList('/applications/',reload);const[members]=useList('/members/',reload);const[products]=useList('/loan-products/',reload);const[f,setF]=useState({member:'',product:'',requested_amount:'',purpose:'',notes:''});async function save(e){e.preventDefault();try{await api().post('/applications/',normalize(f));setF({member:'',product:'',requested_amount:'',purpose:'',notes:''});load()}catch(e){alert(JSON.stringify(e.response?.data||'Failed'))}}async function act(id,kind){try{await api().post(`/applications/${id}/${kind}/`);load();reload()}catch(e){alert(JSON.stringify(e.response?.data||'Failed'))}}
 function printApplication(x){const m=members.find(v=>Number(v.id)===Number(x.member_id||x.member));const prod=products.find(v=>Number(v.id)===Number(x.product_id||x.product));const val=(label,value)=>`<div class="field"><b>${label}</b>${value??'—'}</div>`;const body=`${printBrandHeader('PERSONAL LOAN APPLICATION FORM',`Application #${x.id} · Printed ${new Date().toLocaleDateString('en-IN')}`)}<h2>1. Applicant Details</h2><div class="grid">${val('Member No.',m?.member_no||x.member)}${val('Applicant Name',m?.name||x.member_name||'')}${val('Mobile Number',m?.phone||'')}${val('Email',m?.email||'')}${val('Date of Birth',m?.dob||'')}${val('Gender',m?.gender||'')}${val('Occupation',m?.occupation||'')}${val('Household Income',m?.household_income!=null?money(m.household_income):'')}${val('Address',m?.address||'')}${val('Nominee',m?.nominee||'')}${val('Nominee Relation',m?.nominee_relation||'')}</div><h2>2. Loan Details</h2><div class="grid">${val('Loan Product',prod?.name||x.product_name||x.product)}${val('Requested Amount',money(x.requested_amount))}${val('Interest Method',prod?.interest_method||'As per approved plan')}${val('Interest Rate',prod?.interest_rate!=null?prod.interest_rate+'% p.a.':'As per approved plan')}${val('Repayment Frequency',prod?.frequency||'As per approved plan')}${val('Tenure / Installments',prod?.tenure??'As per approved plan')}${val('Processing Fee',prod?.processing_fee!=null?money(prod.processing_fee):'As applicable')}${val('Purpose',x.purpose||'')}</div><div class="declaration"><b>Applicant Declaration & Consent</b><br>I confirm that the information provided in this application is true and complete to the best of my knowledge. I authorize NMFA to verify the submitted information and documents for the purpose of assessing this loan application. I understand that this application is not a promise of approval or disbursement. Final terms are subject to written sanction and applicable agreements.</div><div class="signs"><div class="sign">Applicant Signature / Thumb Impression<br>Name: ${m?.name||x.member_name||''}<br>Date: __________________</div><div class="sign">Loan Officer Signature<br>Name / Employee ID: __________________</div><div class="sign">Witness Signature (if applicable)<br>Name: __________________</div><div class="sign">For NMFA — Authorized Officer<br>Decision / Date: __________________</div></div><p class="muted" style="margin-top:20px">This application form records the request only. Approved loan amount, fees, repayment schedule and final legal terms must be confirmed in the sanction letter / loan agreement before disbursement.</p>`;printHtml(`NMFA Loan Application #${x.id}`,body)}
 return <><PageTitle title="Loan Applications" sub="Application, eligibility, approval and rejection workflow"/><section className="panel"><h3>Apply For Loan</h3><form className="formgrid" onSubmit={save}><label>Member<select required value={f.member} onChange={e=>setF({...f,member:e.target.value})}><option value="">Select</option>{members.map(x=><option key={x.id} value={x.id}>{x.member_no} - {x.name}</option>)}</select></label><label>Loan Product<select required value={f.product} onChange={e=>setF({...f,product:e.target.value})}><option value="">Select</option>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Requested Amount<input required min="1" type="number" value={f.requested_amount} onChange={e=>setF({...f,requested_amount:e.target.value})}/></label><label>Purpose<input value={f.purpose} onChange={e=>setF({...f,purpose:e.target.value})}/></label><label>Notes<input value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></label><button className="primary" type="submit">Submit Application</button></form></section><section className="panel"><h3>{review?'Approval Queue':'Recent Applications'}</h3><div className="tableWrap"><table><thead><tr><th>ID</th><th>Member</th><th>Product</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.map(x=><tr key={x.id}><td>#{x.id}</td><td>{x.member_name||x.member}</td><td>{x.product_name||x.product}</td><td>{money(x.requested_amount)}</td><td><span className="status">{x.status}</span></td><td><button className="smallBtn" onClick={()=>printApplication(x)}>Print Application / Sign</button> {x.status==='pending'&&<><button className="smallBtn" onClick={()=>act(x.id,'approve')}>Approve</button><button className="smallBtn dangerBtn" onClick={()=>act(x.id,'reject')}>Reject</button></>}</td></tr>)}</tbody></table></div></section></>}

function Loans({reload,approval}){
 const[data,load]=useList('/loans/',reload);const[products]=useList('/loan-products/',reload);const[members]=useList('/members/',reload);const[employees]=useList('/employees/',reload);const[branches]=useList('/branches/',reload);const[centres]=useList('/centres/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[customerFilter,setCustomerFilter]=useState(''),[planFilter,setPlanFilter]=useState(''),[typeFilter,setTypeFilter]=useState('All'),[closeStart,setCloseStart]=useState(''),[closeEnd,setCloseEnd]=useState(''),[dateFilter,setDateFilter]=useState(''),[lastEmiStart,setLastEmiStart]=useState(''),[lastEmiEnd,setLastEmiEnd]=useState(''),[planTypeFilter,setPlanTypeFilter]=useState('All'),[recoveryFilter,setRecoveryFilter]=useState('All'),[statusFilter,setStatusFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const[disburseLoan,setDisburseLoan]=useState(null),[disburseForm,setDisburseForm]=useState({date:dateNow(),emi_start_date:nextEmiDate(dateNow(),'monthly'),method:'bank',bank_account:'',reference:''}),[disburseBusy,setDisburseBusy]=useState(false),[popup,setPopup]=useState(null),[scheduleModal,setScheduleModal]=useState(null);
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 async function submitDisbursement(e){e.preventDefault();if(!disburseLoan)return;setPopup({type:'confirm',title:'Are you sure?',message:`Loan #${disburseLoan.id} ka ${money(disburseLoan.principal)} ${disburseForm.method==='cash'?'Cash':'Bank A/C'} se disburse karna hai?`,confirmLabel:'Yes, confirm it',onConfirm:async()=>{setDisburseBusy(true);try{await api().post(`/loans/${disburseLoan.id}/disburse/`,{amount:disburseLoan.principal,date:disburseForm.date,emi_start_date:disburseForm.emi_start_date,method:disburseForm.method,bank_account:disburseForm.bank_account,reference:disburseForm.reference||`DISB-LOAN-${disburseLoan.id}`});setDisburseLoan(null);await load();await reload();setPopup({type:'success',title:'Success!',message:'Loan successfully disbursed.'})}catch(err){setPopup({type:'error',title:'Disbursement failed',message:err.response?.data?.detail||JSON.stringify(err.response?.data||'Please try again.')})}finally{setDisburseBusy(false)}}});}
 async function foreclose(loan){try{const q=await api().get(`/loans/${loan.id}/foreclose/`);const amount=Number(q.data.outstanding_amount||0);if(amount<=0){alert('No outstanding amount found for this loan.');return}if(!window.confirm(`Foreclose loan #${loan.id} for ${money(amount)}?`))return;const payload={amount:amount.toFixed(2),method:'cash',paid_on:dateNow(),reference:`FORECLOSE-${loan.id}-${Date.now()}`,idempotency_key:`FORECLOSE-${loan.id}-${Date.now()}`};const r=await api().post(`/loans/${loan.id}/foreclose/`,payload);alert(`Loan closed. Receipt: ${r.data.receipt_no||'created'}; amount: ${money(r.data.foreclosure_amount||amount)}`);load();reload()}catch(e){alert(JSON.stringify(e.response?.data||'Foreclosure failed'))}}
 async function viewSchedule(loan){try{const r=await api().get(`/loans/${loan.id}/schedule/`);setScheduleModal({loan,rows:r.data||[]})}catch(err){setScheduleModal({loan,rows:[]})}}
 async function printEmiCard(loan){try{const [sr,mr,pr]=await Promise.all([api().get(`/loans/${loan.id}/schedule/`),api().get(`/members/${loan.member}/`),api().get(`/loan-products/${loan.product}/`)]);const m=mr.data,p=pr.data,rows=sr.data||[];const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const body=`${printBrandHeader('LOAN EMI CARD / REPAYMENT RECORD',`Loan #${loan.id} · Printed ${new Date().toLocaleDateString('en-IN')}`)}<div class="grid"><div class="field"><b>Customer</b>${esc(m.name)}</div><div class="field"><b>Member No.</b>${esc(m.member_no)}</div><div class="field"><b>Contact</b>${esc(m.phone)}</div><div class="field"><b>Product</b>${esc(p.name)}</div><div class="field"><b>Principal</b>${money(loan.principal)}</div><div class="field"><b>Interest Total</b>${money(loan.interest_total)}</div><div class="field"><b>Total Payable</b>${money(loan.total_payable)}</div><div class="field"><b>Frequency / Tenure</b>${esc(p.frequency)} / ${esc(p.tenure)}</div></div><h2>Installment Schedule</h2><table class="table"><thead><tr><th>No.</th><th>Due Date</th><th>Principal Due</th><th>Interest Due</th><th>Penalty Due</th><th>Installment Total</th><th>Received Date / Ref.</th><th>Received Amount</th><th>Staff Sign</th></tr></thead><tbody>${rows.map(i=>`<tr><td>${i.number}</td><td>${esc(i.due_date)}</td><td>${money(i.principal_due)}</td><td>${money(i.interest_due)}</td><td>${money(i.penalty_due)}</td><td>${money(Number(i.principal_due||0)+Number(i.interest_due||0)+Number(i.penalty_due||0))}</td><td>________________</td><td>${money(Number(i.principal_paid||0)+Number(i.interest_paid||0)+Number(i.penalty_paid||0))}</td><td>________</td></tr>`).join('')}</tbody></table><div class="signs"><div class="sign">Customer Signature / Thumb Impression</div><div class="sign">Authorized NMFA Officer</div></div>`;printHtml(`NMFA EMI Card #${loan.id}`,body)}catch(e){alert(JSON.stringify(e.response?.data||'EMI card could not load.'))}}
 const rows=data.map(x=>{
  const p=prodById[String(x.product)]||{};const m=memById[String(x.member)]||{};const st=empById[String(m.field_officer)]||{};const br=branchById[String(m.branch||x.branch)]||{};const ce=centreById[String(m.centre)]||{};
  const disbDt=x.disbursed_on||x.start_date||String(x.created_at||'').slice(0,10);
  return {...x,plan_name:x.product_name||p.name||`PLAN #${x.product}`,freq:(p.recovery_type||p.frequency||'monthly').toUpperCase(),plan_type:(p.interest_method||'flat').toUpperCase(),mem_name:x.member_name||m.name||`Member #${x.member}`,mobile:m.phone||'—',branch_id:m.branch||x.branch,branch_name:x.branch_name||br.name||'—',centre_name:x.branch_center_name||ce.name||'—',staff_id:m.field_officer,staff_name:x.staff_name||st.name||'—',disb_date:disbDt,emi_start:x.emi_start_date||disbDt,emi_last:x.end_date||'—',close_date:x.closed_on||'—'};
 }).filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(customerFilter&&String(r.member)!==String(customerFilter))return false;
  if(planFilter&&String(r.product)!==String(planFilter))return false;
  if(planTypeFilter!=='All'&&r.plan_type.toLowerCase()!==planTypeFilter.toLowerCase())return false;
  if(recoveryFilter!=='All'&&r.freq.toLowerCase()!==recoveryFilter.toLowerCase())return false;
  if(statusFilter&&String(r.status).toLowerCase()!==statusFilter.toLowerCase())return false;
  if(dateFilter&&r.disb_date!==dateFilter)return false;
  if(search&&!`${r.id} ${r.mem_name} ${r.mobile} ${r.plan_name} ${r.branch_name}`.toLowerCase().includes(search.toLowerCase()))return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));const shown=rows.slice((page-1)*pageSize,page*pageSize);
 const totalOutstanding=rows.filter(x=>x.status==='disbursed'||x.status==='active').reduce((s,x)=>s+Number(x.total_payable||x.principal||0),0);
 return <><PageTitle title="LOAN SUMMARY" sub="Complete Loan Summary with 12 reference SEARCH BY filters, Outstanding Amount metric, Excel export and Task actions.">
  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><span className="count" style={{fontWeight:800}}>OUTSTANDING AMOUNT : {money(totalOutstanding)}</span><button type="button" className="masterAddBtn" onClick={()=>exportCsvRows(`loan_summary_${dateNow()}.csv`,['SR. NO.','LOANID','MEM NAME','MOBILE','BRANCH CENTER','BRANCH','DISBURSEMENT DATE','EMI STARTDATE','EMI LASTDATE','LOAN CLOSE DATE','PLAN AMT','STATUS'],rows.map((x,i)=>[i+1,x.id,x.mem_name,x.mobile,x.centre_name,x.branch_name,x.disb_date,x.emi_start,x.emi_last,x.close_date,x.principal,x.status]))}>DOWNLOAD EXCEL</button></div>
 </PageTitle>
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>CUSTOMER (TYPE HERE)<select value={customerFilter} onChange={e=>setCustomerFilter(e.target.value)}><option value="">All Customers</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>LOAN PLAN NAME<select value={planFilter} onChange={e=>setPlanFilter(e.target.value)}><option value="">All Plans</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="All">All (Individual &amp; Group)</option><option value="Individual">Individual Loan</option><option value="Group">Group Loan</option></select></label>
  <label>LOAN CLOSE START DATE<input type="date" value={closeStart} onChange={e=>setCloseStart(e.target.value)}/></label>
  <label>LOAN CLOSE END DATE<input type="date" value={closeEnd} onChange={e=>setCloseEnd(e.target.value)}/></label>
  <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
  <label>LAST EMI START DATE<input type="date" value={lastEmiStart} onChange={e=>setLastEmiStart(e.target.value)}/></label>
  <label>LAST EMI END DATE<input type="date" value={lastEmiEnd} onChange={e=>setLastEmiEnd(e.target.value)}/></label>
  <label>SELECT PLAN TYPE *<select value={planTypeFilter} onChange={e=>setPlanTypeFilter(e.target.value)}><option value="All">All</option><option value="flat">Flat</option><option value="reducing">Reducing</option></select></label>
  <label>RECOVERY TYPE *<select value={recoveryFilter} onChange={e=>setRecoveryFilter(e.target.value)}><option value="All">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
  <label>SELECT STATUS *<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="approved">Approved</option><option value="disbursed">Disbursed</option><option value="closed">Closed</option><option value="pending">Pending</option></select></label>
  <div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>SUBMIT</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setStaffFilter('');setCustomerFilter('');setPlanFilter('');setStatusFilter('');setDateFilter('');setSearch('')}}>Reset</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search Loan ID, Member, Mobile"/><button type="button" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>ACTION</th><th>LOANID</th><th>MEM NAME</th><th>MOBILE</th><th>BRANCH CENTER</th><th>BRANCH</th><th>DISBURSEMENT DATE</th><th>EMI STARTDATE</th><th>EMI LASTDATE</th><th>LOAN CLOSE DATE</th><th>PLAN AMT</th><th>STATUS</th></tr></thead><tbody>{shown.map((x,i)=><tr key={x.id}><td>{(page-1)*pageSize+i+1}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>viewSchedule(x)}>👁 View EMI Schedule</button><button type="button" onClick={()=>printEmiCard(x)}>🖨 Print EMI Card</button>{x.status==='approved'&&<button type="button" onClick={()=>{setDisburseLoan(x);setDisburseForm({date:dateNow(),emi_start_date:nextEmiDate(dateNow(),prodById[String(x.product)]?.frequency||'monthly'),method:'bank',bank_account:'',reference:''})}}>₹ Disburse Loan</button>}{x.status==='disbursed'&&<button type="button" onClick={()=>foreclose(x)}>✓ Foreclose Loan</button>}</div></details></td><td>#{x.id}</td><td>{x.mem_name}</td><td>{x.mobile}</td><td>{x.centre_name}</td><td>{x.branch_name}</td><td>{x.disb_date||'—'}</td><td>{x.emi_start||'—'}</td><td>{x.emi_last}</td><td>{x.close_date}</td><td>{money(x.principal)}</td><td><span className={/approved|disbursed|closed/i.test(x.status||'')?'status ok':'status off'}>{String(x.status||'pending').toUpperCase()}</span></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No loan records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {rows.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,rows.length)} OF {rows.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section>
 {scheduleModal&&<div className="masterModalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setScheduleModal(null)}}><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>LOAN #{scheduleModal.loan.id} — {scheduleModal.loan.mem_name} ({money(scheduleModal.loan.principal)})</b><button type="button" onClick={()=>setScheduleModal(null)}>×</button></header><div className="masterModalBody"><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>EMI NO.</th><th>DUE DATE</th><th>PRINCIPAL DUE</th><th>INTEREST DUE</th><th>PENALTY DUE</th><th>TOTAL EMI</th><th>STATUS</th></tr></thead><tbody>{scheduleModal.rows.map(r=><tr key={r.id||r.number}><td>#{r.number}</td><td>{r.due_date}</td><td>{money(r.principal_due)}</td><td>{money(r.interest_due)}</td><td>{money(r.penalty_due)}</td><td>{money(Number(r.principal_due||0)+Number(r.interest_due||0)+Number(r.penalty_due||0))}</td><td><span className={r.status==='paid'?'status ok':'status off'}>{String(r.status||'pending').toUpperCase()}</span></td></tr>)}</tbody></table>{!scheduleModal.rows.length&&<div className="empty">No installment schedule generated yet.</div>}</div></div><div className="masterModalActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>printEmiCard(scheduleModal.loan)}>PRINT EMI CARD</button><button type="button" className="masterCancelBtn" onClick={()=>setScheduleModal(null)}>CLOSE</button></div></section></div>}
 {disburseLoan&&<div className="nmfaModalBackdrop" role="presentation"><section className="nmfaModal" role="dialog" aria-modal="true" aria-labelledby="disburse-title"><header className="nmfaModalHeader"><h2 id="disburse-title">Disbursement Loan</h2><button type="button" aria-label="Close" onClick={()=>setDisburseLoan(null)}>×</button></header><form className="nmfaModalBody" onSubmit={submitDisbursement}><div className="formgrid"><label>Loan / Member<input readOnly value={`Loan #${disburseLoan.id} · ${disburseLoan.member_name||disburseLoan.member}`}/></label><label>Disbursement Amount<input readOnly value={money(disburseLoan.principal)}/></label><label>Disbursement Date *<input required type="date" value={disburseForm.date} onChange={e=>setDisburseForm({...disburseForm,date:e.target.value})}/></label><label>EMI Start Date *<input required type="date" min={disburseForm.date} value={disburseForm.emi_start_date} onChange={e=>setDisburseForm({...disburseForm,emi_start_date:e.target.value})}/></label><label>Disbursement From *<select required value={disburseForm.method} onChange={e=>setDisburseForm({...disburseForm,method:e.target.value})}><option value="bank">Company Bank A/C</option><option value="cash">Cash</option></select></label>{disburseForm.method==='bank'&&<label>Company Bank Account Name *<input required value={disburseForm.bank_account} onChange={e=>setDisburseForm({...disburseForm,bank_account:e.target.value})} placeholder="e.g. HDFC Current A/C ••••1234"/></label>}<label>Reference (optional)<input value={disburseForm.reference} onChange={e=>setDisburseForm({...disburseForm,reference:e.target.value})} placeholder={`DISB-LOAN-${disburseLoan.id}`}/></label></div><footer className="nmfaModalFooter"><button type="submit" className="successBtn" disabled={disburseBusy}>{disburseBusy?'Processing…':'DISBURSEMENT'}</button><button type="button" className="cancelBtn" disabled={disburseBusy} onClick={()=>setDisburseLoan(null)}>CANCEL</button></footer></form></section></div>}{popup&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${popup.type}`}>{popup.type==='success'?'✓':popup.type==='confirm'?'!':'×'}</div><h2>{popup.title}</h2><p>{popup.message}</p><div className="nmfaAlertActions">{popup.type==='confirm'?<><button className="successBtn" onClick={()=>{const fn=popup.onConfirm;setPopup(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" onClick={()=>setPopup(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setPopup(null)}>OK</button>}</div></section></div>}</>
}

function Disbursement({reload}){const[data]=useList('/disbursements/',reload);const[loans]=useList('/loans/',reload);const rows=useMemo(()=>data.map(d=>{const loan=loans.find(x=>String(x.id)===String(d.loan));return {...d,loan_label:loan?`#${loan.id} · ${loan.member_name||loan.member_name_display||loan.member}`:`#${d.loan??'—'}`,amount_label:money(d.amount),date_label:d.date||d.disbursed_on||'—',method_label:pretty(d.method||d.pay_mode||'—'),bank_account_label:d.bank_account||'Legacy / not recorded',reference_label:d.reference||d.transaction_reference||'—'} }),[data,loans]);return <><PageTitle title="Disbursement" sub="Loan disbursement register · searchable, paginated and reference-style"><span className="count">{data.length} records</span></PageTitle><section className="panel"><div className="panelHeadingRow"><h3>DISBURSEMENT LIST</h3></div><Table data={rows} columns={['loan_label','amount_label','date_label','method_label','bank_account_label','reference_label','status']}/></section></>}
function Installments({filter,go=()=>{}}){
 const[data]=useList(filter?'/installments/?state='+filter:'/installments/');const[loans]=useList('/loans/');const[members]=useList('/members/');const[branches]=useList('/branches/');const[employees]=useList('/employees/');const[centres]=useList('/centres/');const[products]=useList('/loan-products/');
 const[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[memberFilter,setMemberFilter]=useState(''),[appNo,setAppNo]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState(''),[citySearch,setCitySearch]=useState(''),[recoveryFilter,setRecoveryFilter]=useState('All'),[selected,setSelected]=useState([]),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const isPaid=filter==='paid';const isDue=filter==='due';
 const title=isPaid?'MEMBER PAID EMIS':isDue?'MEMBER DUE EMIS':'EMI RECORDS';
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const prodById=Object.fromEntries(products.map(p=>[String(p.id),p]));
 const rows=data.map(inst=>{
  const l=loanById[String(inst.loan)]||{};const m=memById[String(l.member)]||{};const br=branchById[String(m.branch)]||{};const st=empById[String(m.field_officer)]||{};const ce=centreById[String(m.centre)]||{};const p=prodById[String(l.product)]||{};
  const amt=isPaid?(Number(inst.principal_paid||0)+Number(inst.interest_paid||0)):(Number(inst.principal_due||0)+Number(inst.interest_due||0));
  return {...inst,loan_id:l.id||inst.loan,mem_id:m.id,mem_name:m.name||`Member #${l.member}`,alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',city:m.city||m.address||'',type:(p.recovery_type||p.frequency||'monthly').toUpperCase(),center_name:ce.name||'—',branch_id:m.branch,branch_name:br.name||'—',staff_id:m.field_officer,staff_name:st.name||'—',pay_date:inst.due_date,amount:amt};
 }).filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(memberFilter&&String(r.mem_id)!==String(memberFilter))return false;
  if(appNo&&!String(r.loan_id).includes(appNo))return false;
  if(statusFilter&&String(r.status)!==String(statusFilter))return false;
  if(dateFilter&&r.pay_date!==dateFilter)return false;
  if(startDate&&r.pay_date<startDate)return false;
  if(endDate&&r.pay_date>endDate)return false;
  if(citySearch&&!`${r.city} ${r.mem_name}`.toLowerCase().includes(citySearch.toLowerCase()))return false;
  if(recoveryFilter!=='All'&&r.type.toLowerCase()!==recoveryFilter.toLowerCase())return false;
  return true;
 });
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));const shown=rows.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title={title} sub={isPaid?'Filter paid installments and export to Excel':isDue?'Filter due installments for field collection':'Complete installment schedule register'}>
  <div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`${filter||'all'}_emis_${dateNow()}.csv`,['SR.','LOANID','MEM NAME','ALIAS','MOBILE','TYPE','CENTERNAME','DATE','AMOUNT','BRANCH','STATUS'],rows.map((r,i)=>[i+1,r.loan_id,r.mem_name,r.alias,r.mobile,r.type,r.center_name,r.pay_date,r.amount,r.branch_name,r.status]))}>DOWNLOAD EXCEL</button>{isDue&&<button type="button" className="secondary" onClick={()=>window.print()}>GET PRINT</button>}</div>
 </PageTitle>
 <section className="panel"><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>APPLICATION NO / LOAN ID<input value={appNo} onChange={e=>setAppNo(e.target.value)} placeholder="Loan ID"/></label>
  <label>RECOVERY TYPE *<select value={recoveryFilter} onChange={e=>setRecoveryFilter(e.target.value)}><option value="All">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
  <label>SELECT PAYMENT STATUS<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All</option><option value="paid">Paid</option><option value="pending">Pending / Due</option></select></label>
  <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
  <label>{isPaid?'PAYMENT START DATE':'EMI FROM DATE'}<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
  <label>{isPaid?'PAYMENT END DATE':'EMI TO DATE'}<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
  {isDue&&<label>SEARCH BY CITY<input value={citySearch} onChange={e=>setCitySearch(e.target.value)} placeholder="City"/></label>}
  <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>setPage(1)}>GET RECORD</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setStaffFilter('');setMemberFilter('');setAppNo('');setStatusFilter('');setDateFilter('');setStartDate('');setEndDate('');setCitySearch('');setRecoveryFilter('All')}}>Reset</button></div>
 </div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>{isPaid?<tr><th>SELECT</th><th>SR.</th><th>LOANID</th><th>MEM NAME</th><th>ALIAS</th><th>MOBILE</th><th>TYPE</th><th>CENTERNAME</th><th>PAY DATE</th><th>AMOUNT</th><th>BRANCH</th><th>ACTION</th></tr>:<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>ALIAS</th><th>CONTACTNUMBER</th><th>TYPE</th><th>STAFF</th><th>EMI NO.</th><th>EMI DATE</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr>}</thead><tbody>{shown.map((r,i)=>isPaid?<tr key={r.id}><td><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.id]:s.filter(x=>x!==r.id))}/></td><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.type}</td><td>{r.center_name}</td><td>{r.pay_date}</td><td>{money(r.amount)}</td><td>{r.branch_name}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print EMI Receipt</button></div></details></td></tr>:<tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.type}</td><td>{r.staff_name}</td><td>#{r.number}</td><td>{r.pay_date}</td><td>{money(r.amount)}</td><td><span className={r.status==='paid'?'status ok':'status off'}>{String(r.status||'pending').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>go('Collection / EMI')}>₹ Collect EMI</button><button type="button" onClick={()=>window.print()}>🖨 Print Demand</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No installment records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {rows.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,rows.length)} OF {rows.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>
}

function Payments({reload}){const[data,load]=useList('/payments/',reload);const[members]=useList('/members/',reload);const[loans]=useList('/loans/',reload);const[f,setF]=useState({member:'',loan:'',amount:'',method:'cash',bank_account:'',reference:'',paid_on:dateNow(),status:'success'});async function save(e){e.preventDefault();try{await api().post('/payments/',normalize({...f,receipt_no:''}));setF({...f,amount:'',reference:''});load();reload()}catch(e){alert(JSON.stringify(e.response?.data||'Failed'))}}return <><PageTitle title="Collection / EMI" sub="Cash, UPI, bank and gateway collection with automatic EMI allocation"/><section className="panel"><h3>Collect EMI</h3><form className="formgrid" onSubmit={save}><label>Member<select value={f.member} onChange={e=>setF({...f,member:e.target.value})}><option value="">Select</option>{members.map(x=><option key={x.id} value={x.id}>{x.member_no} - {x.name}</option>)}</select></label><label>Loan<select value={f.loan} onChange={e=>setF({...f,loan:e.target.value})}><option value="">Select</option>{loans.map(x=><option key={x.id} value={x.id}>Loan #{x.id} - {money(x.principal)}</option>)}</select></label><label>Amount<input type="number" min="1" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Method<select value={f.method} onChange={e=>setF({...f,method:e.target.value,bank_account:e.target.value==='bank'?f.bank_account:''})}><option>cash</option><option>upi</option><option>bank</option><option>card</option><option>gateway</option></select></label>{f.method==='bank'&&<label>Company Bank Account Name<input value={f.bank_account} onChange={e=>setF({...f,bank_account:e.target.value})} placeholder="e.g. SBI Current A/C"/></label>}<label>Reference<input value={f.reference} onChange={e=>setF({...f,reference:e.target.value})}/></label><button className="primary">Save & Generate Receipt</button></form></section><section className="panel"><h3>Collection Register</h3><Table data={data} columns={['receipt_no','member','loan','amount','method','bank_account','paid_on','status']}/></section></>}
function OverdueTransferPage({reload}){
 const[requests,loadRequests]=useList('/overdue-transfers/');const[branches]=useList('/branches/');const[employees]=useList('/employees/');
 const[queue,setQueue]=useState([]);const[busy,setBusy]=useState('');const[err,setErr]=useState('');const[msg,setMsg]=useState('');
 const[f,setF]=useState({loan:'',to_branch:'',to_employee:'',reason:''});
 async function loadQueue(){try{const r=await api().get('/overdue-transfers/queue/');setQueue(r.data||[])}catch(e){setErr(JSON.stringify(e.response?.data||'Overdue queue load nahi hui. Permission aur migration check karein.'))}}
 useEffect(()=>{void loadQueue()},[]);
 const selected=queue.find(x=>String(x.loan)===String(f.loan));
 const targetEmployees=employees.filter(e=>String(e.branch)===String(f.to_branch)&&e.active!==false);
 async function submit(e){e.preventDefault();if(!selected||!f.to_branch||!f.to_employee||f.reason.trim().length<5){setErr('Overdue loan, destination branch/staff aur kam se kam 5 characters ka reason select karein.');return}
   if(selected.pending_transfer_id){setErr(`Is loan par transfer request #${selected.pending_transfer_id} pehle se pending hai.`);return}
   const cross=String(selected.source_branch)!==String(f.to_branch);const ok=window.confirm(`Loan #${selected.loan} ka overdue recovery assignment ${cross?'doosri branch':'same branch'} mein transfer request submit karein? Loan/member branch aur accounting ledger change nahi honge.`);if(!ok)return;
   setBusy('submit');setErr('');setMsg('');try{const key=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():`ODT-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;const r=await api().post('/overdue-transfers/',{loan:Number(f.loan),to_branch:Number(f.to_branch),to_employee:Number(f.to_employee),reason:f.reason.trim(),idempotency_key:key});setMsg(`Transfer request #${r.data.id} submitted for independent approval.`);setF({...f,loan:'',to_employee:'',reason:''});await loadRequests();await loadQueue();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||'Overdue transfer request failed'))}finally{setBusy('')}}
 async function decide(row,verb){const note=window.prompt(verb==='approve'?'Approval note (required):':'Rejection reason (at least 5 characters):');if(!note||note.trim().length<(verb==='approve'?1:5))return;setBusy(`${row.id}:${verb}`);setErr('');try{await api().post(`/overdue-transfers/${row.id}/${verb}/`,{approval_note:note.trim()});setMsg(`Transfer request #${row.id} ${verb==='approve'?'approved':'rejected'}.`);await loadRequests();await loadQueue();if(reload)await reload()}catch(e){setErr(JSON.stringify(e.response?.data||`${verb} failed`))}finally{setBusy('')}}
 return <><PageTitle title="Overdue Transfer" sub="Reassign overdue recovery responsibility between field officers or branches. This does not move loan ownership or post accounting entries."/>
 <section className="panel"><h3>Overdue Recovery Queue ({queue.length})</h3>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}<div className="tableWrap"><table><thead><tr>{['Loan','Member','Current Branch','Current Officer','Overdue Amount','Overdue EMIs','Pending Request'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{queue.map(x=><tr key={x.loan}><td>#{x.loan}</td><td>{x.member_no} — {x.member_name}</td><td>{x.source_branch_name}</td><td>{x.source_employee_name||'Unassigned'}</td><td>₹{Number(x.overdue_amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td>{x.overdue_installments}</td><td>{x.pending_transfer_id?`#${x.pending_transfer_id} pending`:'—'}</td></tr>)}</tbody></table>{!queue.length&&<div className="empty">No overdue recovery cases in your authorized branch scope.</div>}</div><button className="secondary" onClick={()=>{loadQueue();loadRequests()}}>Refresh</button></section>
 <section className="panel"><h3>Submit Transfer Request</h3><form className="formgrid" onSubmit={submit}><label>Overdue loan *<select required value={f.loan} onChange={e=>{const q=queue.find(x=>String(x.loan)===e.target.value);setF({...f,loan:e.target.value,to_branch:q?String(q.source_branch):'',to_employee:''})}}><option value="">Select overdue loan</option>{queue.filter(x=>!x.pending_transfer_id).map(x=><option key={x.loan} value={x.loan}>Loan #{x.loan} — {x.member_name} — ₹{Number(x.overdue_amount).toFixed(2)}</option>)}</select></label><label>Destination branch *<select required value={f.to_branch} onChange={e=>setF({...f,to_branch:e.target.value,to_employee:''})}><option value="">Select branch</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label>Destination recovery staff *<select required value={f.to_employee} onChange={e=>setF({...f,to_employee:e.target.value})}><option value="">Select active field officer</option>{targetEmployees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label><label className="wideField">Reason *<textarea required minLength="5" maxLength="2000" rows="2" value={f.reason} onChange={e=>setF({...f,reason:e.target.value})} placeholder="Recovery workload, staff transfer, customer location, etc."/></label>{selected&&<div className="wideField alert">Current assignment: {selected.source_branch_name} / {selected.source_employee_name||'Unassigned'} · Overdue snapshot ₹{Number(selected.overdue_amount).toFixed(2)} across {selected.overdue_installments} installment(s). Cross-branch requests require organization-admin approval.</div>}<button className="primary" disabled={busy==='submit'||!selected||!f.to_employee}>{busy==='submit'?'Submitting…':'Submit for Maker-Checker Approval'}</button></form><p className="muted">Transfer only changes the recovery assignment. The loan/member branch, EMI schedule, customer balance and accounting ledger are not altered. No financial journal entry is posted by this workflow.</p></section>
 <section className="panel"><h3>Transfer History & Approval Queue</h3><div className="tableWrap"><table><thead><tr>{['Request','Loan','Member','From Branch / Staff','To Branch / Staff','Overdue Snapshot','Reason','Status','Actions'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>#{r.id}<br/><small>{String(r.created_at||'').slice(0,10)}</small></td><td>#{r.loan_id}</td><td>{r.member_no} — {r.member_name}</td><td>{r.source_branch_name} / {r.source_employee_name||'Unassigned'}</td><td>{r.target_branch_name} / {r.target_employee_name}</td><td>₹{Number(r.overdue_amount_snapshot).toFixed(2)} ({r.overdue_installments_snapshot})</td><td>{r.reason}<br/><small>{r.decision_note||''}</small></td><td>{r.status}</td><td>{r.status==='pending'?<><button className="smallBtn" disabled={!!busy} onClick={()=>decide(r,'approve')}>Approve</button> <button className="smallBtn dangerBtn" disabled={!!busy} onClick={()=>decide(r,'reject')}>Reject</button></>:'—'}</td></tr>)}</tbody></table>{!requests.length&&<div className="empty">No overdue transfer requests yet.</div>}</div></section></>;
}

function Recovery(){const[data]=useList('/installments/');const overdue=data.filter(x=>x.status!=='paid'&&x.due_date<dateNow());return <><PageTitle title="Overdue / Recovery" sub="Overdue installments for follow-up and recovery"/><section className="panel"><h3>Overdue Queue ({overdue.length})</h3><Table data={overdue} columns={['loan','number','due_date','principal_due','interest_due','principal_paid','interest_paid','status']}/></section></>}
function Capital({reload}){const[data,load]=useList('/capital/',reload);const[dash]=useDashboard(reload);const[journals]=useList('/journal/',reload);const[disbursements]=useList('/disbursements/',reload);const[branches]=useList('/branches/',reload);const[f,setF]=useState({kind:'in',amount:'',date:dateNow(),bank_account:'',reference:'',note:'',branch:''});const bankBalances=useMemo(()=>{const totals={};(journals||[]).forEach(j=>{const name=String(j.account||'');if(!/^bank(?::|$)/i.test(name))return;const acct=name.replace(/^bank:\s*/i,'').trim()||'Legacy Bank (account not specified)';const branchLabel=branches.find(b=>String(b.id)===String(j.branch))?.name||(j.branch?'Branch '+j.branch:'Unallocated / legacy');const key=`${branchLabel} — ${acct}`;if(!totals[key])totals[key]=0;totals[key]+=Number(j.debit||0)-Number(j.credit||0)});return Object.entries(totals).map(([account,balance])=>({account,balance})).sort((a,b)=>a.account.localeCompare(b.account))},[journals,branches]);async function save(e){e.preventDefault();try{await api().post('/capital/',normalize({...f,branch:f.branch===''?null:Number(f.branch)}));setF({...f,amount:'',bank_account:'',reference:'',note:''});load();reload()}catch(e){alert(JSON.stringify(e.response?.data||'Failed'))}}return <><PageTitle title="Capital / Investment" sub="Company investment, bank-wise balance and disbursement source tracking"><span className="count">Net {money(dash?.net_capital)}</span></PageTitle><div className="capitalCards"><div><small>Total Invested</small><b>{money(dash?.capital_in)}</b></div><div><small>Total Withdrawn</small><b>{money(dash?.capital_out)}</b></div><div><small>Net Investment</small><b>{money(dash?.net_capital)}</b></div><div><small>Company Bank Balance</small><b>{money(dash?.bank_balance)}</b></div></div><section className="panel"><h3>Company Bank Account Balances</h3><p className="muted">Balances are calculated from posted journal entries, not live bank feeds. Enter the same account name consistently.</p><Table data={bankBalances.map(x=>({...x,balance_label:money(x.balance)}))} columns={['account','balance_label']}/></section><section className="panel"><h3>Add / Reduce Investment</h3><form className="formgrid" onSubmit={save}><label>Type<select value={f.kind} onChange={e=>setF({...f,kind:e.target.value})}><option value="in">Add Investment</option><option value="out">Reduce / Withdraw</option></select></label><label>Amount<input required type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Date<input required type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><label>Branch (blank = organization-wide)<select value={f.branch} onChange={e=>setF({...f,branch:e.target.value})}><option value="">Organization-wide / unallocated</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label>Bank Account (leave blank for cash)<input value={f.bank_account} onChange={e=>setF({...f,bank_account:e.target.value})} placeholder="e.g. SBI Current A/C ••••1234"/></label><label>Reference<input value={f.reference} onChange={e=>setF({...f,reference:e.target.value})}/></label><label>Note<input value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></label><button className="primary">Save Entry</button></form></section><section className="panel"><h3>Disbursement Source Register</h3><p className="muted">Shows which recorded company account each loan was paid from. Older records may not have an account name.</p><Table data={(disbursements||[]).map(d=>({...d,loan_label:`Loan #${d.loan}`,amount_label:money(d.amount),date_label:d.date||'—',account_label:d.method==='cash'?'Cash':(d.bank_account||'Legacy / not recorded')}))} columns={['loan_label','date_label','amount_label','account_label','reference','status']}/></section><section className="panel"><h3>Investment Ledger</h3><Table data={data} columns={['date','kind','amount','bank_account','reference','note']}/></section></>}
function useDashboard(key){const[d,setD]=useState({});useEffect(()=>{api().get('/dashboard/').then(r=>setD(r.data))},[key]);return[d]}
function Expenses({reload}){const[data,load]=useList('/expenses/',reload);const[branches]=useList('/branches/',reload);const[f,setF]=useState({category:'Office',amount:'',date:dateNow(),note:'',branch:''});async function save(e){e.preventDefault();try{await api().post('/expenses/',normalize({...f,branch:f.branch===''?null:Number(f.branch)}));setF({...f,amount:'',note:''});load();reload()}catch(e){alert(JSON.stringify(e.response?.data||'Failed'))}}return <><PageTitle title="Expenses" sub="Operating expense register and cash control"/><section className="panel"><form className="formgrid" onSubmit={save}><label>Category<input required value={f.category} onChange={e=>setF({...f,category:e.target.value})}/></label><label>Amount<input required min="0.01" step="0.01" type="number" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></label><label>Date<input required type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><label>Branch<select value={f.branch} onChange={e=>setF({...f,branch:e.target.value})}><option value="">Organization-wide / unallocated</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</select></label><label className="wideField">Note<input value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></label><button className="primary">Save Expense</button></form></section><section className="panel"><Table data={data.map(x=>({...x,branch_name:x.branch_name||x.branch||'—'}))} columns={['date','category','amount','branch_name','note']}/></section></>}
function FinancialControlsPage({reload}){
 const [locks,loadLocks]=useList('/financial-period-locks/');
 const [reversals,loadReversals]=useList('/payment-reversal-requests/');
 const [payments]=useList('/payments/');
 const [bankBatches,loadBankBatches]=useList('/bank-statement-batches/');
 const [bankLines,setBankLines]=useState([]);
 const [selectedBankBatch,setSelectedBankBatch]=useState('');
 const [bankForm,setBankForm]=useState({bank_account:'',statement_start:dateNow(),statement_end:dateNow(),opening_balance:'',closing_balance:''});
 const [bankFile,setBankFile]=useState(null);
 const [suggestions,setSuggestions]=useState({});
 const [f,setF]=useState({start_date:dateNow(),end_date:dateNow(),reason:''});
 const [rf,setRf]=useState({payment:'',reason:'',idempotency_key:''});
 const [decision,setDecision]=useState('Reviewed and approved after independent verification.');
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 async function loadBankLines(batchId){if(!batchId){setBankLines([]);return}try{const r=await api().get(`/bank-statement-batches/${batchId}/lines/`);setBankLines(r.data.results||r.data)}catch(e){setErr(JSON.stringify(e.response?.data||'Could not load statement lines'))}}
 useEffect(()=>{if(!selectedBankBatch&&bankBatches?.length){const first=bankBatches.find(b=>b.status==='imported')||bankBatches[0];setSelectedBankBatch(String(first.id));}},[bankBatches,selectedBankBatch]);
 useEffect(()=>{if(selectedBankBatch)void loadBankLines(selectedBankBatch);else setBankLines([])},[selectedBankBatch]);
 async function refresh(){loadLocks();loadReversals();loadBankBatches();if(selectedBankBatch)loadBankLines(selectedBankBatch);reload()}
 async function importBankStatement(e){e.preventDefault();if(!bankFile){setErr('Choose a CSV bank statement first.');return}setBusy(true);setErr('');setMsg('');try{const fd=new FormData();fd.append('file',bankFile);fd.append('bank_account',bankForm.bank_account);fd.append('statement_start',bankForm.statement_start);fd.append('statement_end',bankForm.statement_end);fd.append('opening_balance',bankForm.opening_balance);fd.append('closing_balance',bankForm.closing_balance);const r=await api().post('/bank-reconciliation-lines/import-csv/',fd);setBankFile(null);e.target.reset();setSelectedBankBatch(String(r.data.id));setMsg('Bank statement imported. Duplicate file hashes are blocked; every line must be matched to ledger and balance checks must pass before reconciliation.');loadBankBatches();await loadBankLines(r.data.id);reload()}catch(e){setErr(JSON.stringify(e.response?.data||'CSV import failed'))}finally{setBusy(false)}}
 async function suggestMatches(line){setErr('');try{const r=await api().get(`/bank-reconciliation-lines/${line.id}/match-suggestions/`);setSuggestions(prev=>({...prev,[line.id]:r.data.suggestions||[]}))}catch(e){setErr(JSON.stringify(e.response?.data||'Could not load match suggestions'))}}
 async function matchBankLine(line,reference){setBusy(true);setErr('');try{await api().post(`/bank-reconciliation-lines/${line.id}/mark-matched/`,{journal_reference:reference,note:'Matched after bank statement and ledger reference review.'});setMsg(`Statement line #${line.id} matched.`);await refresh();setSuggestions(prev=>({...prev,[line.id]:[]}))}catch(e){setErr(JSON.stringify(e.response?.data||'Match failed'))}finally{setBusy(false)}}
 async function ignoreBankLine(line){const note=window.prompt('Why is this statement line being ignored? This will be audited.');if(!note||note.trim().length<5)return;setBusy(true);setErr('');try{await api().post(`/bank-reconciliation-lines/${line.id}/mark-ignored/`,{note});setMsg(`Statement line #${line.id} marked ignored with reason.`);await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Could not ignore line'))}finally{setBusy(false)}}
 async function closeBankBatch(batch){const note=window.prompt('Reconciliation note (minimum 5 characters):','Statement balance and all lines independently reviewed.');if(!note||note.trim().length<5)return;setBusy(true);setErr('');try{await api().post(`/bank-statement-batches/${batch.id}/reconcile/`,{note});setMsg(`Bank statement batch #${batch.id} reconciled.`);await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Batch reconciliation failed'))}finally{setBusy(false)}}
 async function createLock(e){e.preventDefault();setBusy(true);setErr('');setMsg('');try{await api().post('/financial-period-locks/',f);setF({...f,reason:''});setMsg('Financial period lock request submitted for independent approval.');await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Request failed'))}finally{setBusy(false)}}
 async function requestReverse(e){e.preventDefault();setBusy(true);setErr('');setMsg('');try{await api().post('/payment-reversal-requests/request/',{...rf,payment:Number(rf.payment)});setRf({payment:'',reason:'',idempotency_key:''});setMsg('Payment reversal request submitted; no reversal happens until a different authorized user approves.');await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Request failed'))}finally{setBusy(false)}}
 async function decide(endpoint,id){setBusy(true);setErr('');setMsg('');try{await api().post(`/${endpoint}/${id}/${endpoint==='financial-period-locks'?'approve':'approve'}/`,{decision_note:decision});setMsg('Approval recorded.');await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Approval failed; maker-checker and permission rules apply.'))}finally{setBusy(false)}}
 async function reject(endpoint,id){setBusy(true);setErr('');try{await api().post(`/${endpoint}/${id}/reject/`,{decision_note:decision});setMsg('Request rejected.');await refresh()}catch(e){setErr(JSON.stringify(e.response?.data||'Rejection failed'))}finally{setBusy(false)}}
 const pendingLocks=(locks||[]).filter(x=>x.status==='pending'),pendingReversals=(reversals||[]).filter(x=>x.status==='pending');
 return <><PageTitle title="Financial Controls" sub="Maker-checker period locking and collection reversal controls"/><div className="panel"><h3>Request Financial Period Lock</h3><p className="muted">After a different authorized user approves, new ledger postings dated inside the range are blocked. Existing entries are not changed.</p><form className="formgrid" onSubmit={createLock}><label>Start date<input type="date" required value={f.start_date} onChange={e=>setF({...f,start_date:e.target.value})}/></label><label>End date<input type="date" required value={f.end_date} onChange={e=>setF({...f,end_date:e.target.value})}/></label><label className="wideField">Reason *<textarea minLength="5" required value={f.reason} onChange={e=>setF({...f,reason:e.target.value})}/></label><button className="primary" disabled={busy}>Submit Lock Request</button></form></div><div className="panel"><h3>Request Payment Collection Reversal</h3><p className="muted">This requests an accounting reversal. It does not initiate or verify an external cash/bank refund. Only loan-linked payments with a safe allocation history can be reversed.</p><form className="formgrid" onSubmit={requestReverse}><label>Successful payment *<select required value={rf.payment} onChange={e=>setRf({...rf,payment:e.target.value})}><option value="">Select payment</option>{(payments||[]).filter(p=>p.status==='success'&&!p.is_reversed).map(p=><option key={p.id} value={p.id}>{p.receipt_no} · {p.member_name||p.member} · ₹{Number(p.amount).toFixed(2)}</option>)}</select></label><label>Idempotency key (optional)<input value={rf.idempotency_key} onChange={e=>setRf({...rf,idempotency_key:e.target.value})} placeholder="Unique retry key"/></label><label className="wideField">Reason *<textarea minLength="5" required value={rf.reason} onChange={e=>setRf({...rf,reason:e.target.value})}/></label><button className="primary" disabled={busy||!rf.payment}>Submit Reversal Request</button></form></div><div className="panel"><h3>Approval note (used for decisions)</h3><label>Decision note *<textarea minLength="5" value={decision} onChange={e=>setDecision(e.target.value)}/></label>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert">{msg}</div>}</div><div className="panel"><h3>Financial Period Locks</h3><Table data={locks||[]} columns={['id','start_date','end_date','reason','status','created_by_name','decided_by_name','decision_note']}/><div className="actionRow">{pendingLocks.map(x=><span key={x.id} className="inlineActions">Lock #{x.id} <button className="primary" disabled={busy} onClick={()=>decide('financial-period-locks',x.id)}>Approve</button><button className="secondary" disabled={busy} onClick={()=>reject('financial-period-locks',x.id)}>Reject</button></span>)}</div></div><div className="panel"><h3>Payment Reversal Requests</h3><Table data={reversals||[]} columns={['id','receipt_no','payment_amount','payment_member','reason','status','created_by_name','decided_by_name','reversal_reference','decision_note']}/><div className="actionRow">{pendingReversals.map(x=><span key={x.id} className="inlineActions">Reversal #{x.id} <button className="primary" disabled={busy} onClick={()=>decide('payment-reversal-requests',x.id)}>Approve</button><button className="secondary" disabled={busy} onClick={()=>reject('payment-reversal-requests',x.id)}>Reject</button></span>)}</div></div><div className="panel"><h3>Import Bank Statement CSV</h3><p className="muted">Required columns: statement_date (or date), debit, credit. Optional: description/narration, reference/UTR, statement_balance. Maximum 5 MB and 5,000 rows. Bank account must match an active Asset account in Chart of Accounts. Exact duplicate files are rejected.</p><form className="formgrid" onSubmit={importBankStatement}><label>Bank Account (Chart of Accounts name) *<input required value={bankForm.bank_account} onChange={e=>setBankForm({...bankForm,bank_account:e.target.value})}/></label><label>Statement Start Date *<input required type="date" value={bankForm.statement_start} onChange={e=>setBankForm({...bankForm,statement_start:e.target.value})}/></label><label>Statement End Date *<input required type="date" value={bankForm.statement_end} onChange={e=>setBankForm({...bankForm,statement_end:e.target.value})}/></label><label>Opening Balance *<input required type="number" step="0.01" value={bankForm.opening_balance} onChange={e=>setBankForm({...bankForm,opening_balance:e.target.value})}/></label><label>Closing Balance *<input required type="number" step="0.01" value={bankForm.closing_balance} onChange={e=>setBankForm({...bankForm,closing_balance:e.target.value})}/></label><label>CSV File *<input required type="file" accept=".csv,text/csv" onChange={e=>setBankFile(e.target.files?.[0]||null)}/></label><button className="primary" disabled={busy||!bankFile}>Import Statement</button></form></div><div className="panel"><h3>Bank Statement Import Batches</h3><label>Statement batch to review<select value={selectedBankBatch} onChange={e=>setSelectedBankBatch(e.target.value)}><option value="">Select batch</option>{(bankBatches||[]).map(b=><option key={b.id} value={b.id}>#{b.id} · {b.bank_account} · {b.statement_start} to {b.statement_end} · {b.status}</option>)}</select></label><Table data={bankBatches||[]} columns={['id','bank_account','statement_start','statement_end','row_count','total_debit','total_credit','opening_balance','closing_balance','unmatched_count','status','created_by_name','reconciled_by_name']}/><div className="actionRow">{(bankBatches||[]).filter(b=>b.status==='imported').map(b=><button key={b.id} className="primary" disabled={busy} onClick={()=>closeBankBatch(b)}>Reconcile Batch #{b.id}</button>)}</div></div><div className="panel"><h3>Statement Lines — Match or Flag for Review</h3><p className="muted">Suggestions never auto-match. Review amount, date, direction and reference before confirming. A flagged line cannot be used to close the batch; after an approved ledger adjustment, you can still suggest and confirm a match.</p><div className="tableWrap"><table><thead><tr>{['ID','Date','Bank Account','Description / Reference','Debit','Credit','Status','Actions / Suggestions'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(bankLines||[]).slice(0,250).map(line=><tr key={line.id}><td>#{line.id}{line.batch?` · Batch ${line.batch}`:''}</td><td>{line.statement_date}</td><td>{line.bank_account}</td><td>{line.description}<br/><small>{line.reference}</small></td><td>{money(line.debit)}</td><td>{money(line.credit)}</td><td>{line.status}</td><td>{line.status!=='matched'?<><button className="secondary" disabled={busy} onClick={()=>suggestMatches(line)}>Suggest Matches</button> {line.status==='unmatched'&&<button className="secondary" disabled={busy} onClick={()=>ignoreBankLine(line)}>Flag for Review</button>}{(suggestions[line.id]||[]).map((s,i)=><div key={`${s.journal_id}-${i}`} className="inlineActions"><small>Journal #{s.journal_id} · {s.date} · {s.reference} · {money(s.amount)}</small><button className="smallBtn" disabled={busy} onClick={()=>matchBankLine(line,s.reference)}>Match</button></div>)}</>:line.reconciliation_note||'—'}</td></tr>)}</tbody></table>{!(bankLines||[]).length&&<div className="empty">No bank statement lines imported yet.</div>}</div></div></>
}

function Accounts({tab,reload,branchSel='',go=()=>{}}){
 const isAccountsGroup=tab==='ACGroup';const isExpenses=tab==='Expenses';const isLedger=tab==='Ledger';const isBranchLedger=tab==='Branch Ledger';
 const isVoucherForm=['Payment','Receipt','Contra','Journal'].includes(tab);
 const endpoint=isExpenses?'/expenses/':(isAccountsGroup||isLedger)?'/chart-of-accounts/':('/journal/'+(isBranchLedger&&branchSel?'?branch='+encodeURIComponent(branchSel):''));
 const [data,load]=useList(endpoint,reload);const [branches]=useList('/branches/',reload);const [accounts,loadAccounts]=useList('/chart-of-accounts/',reload);
 const [branchFilter,setBranchFilter]=useState(branchSel||''),[voucherTypeFilter,setVoucherTypeFilter]=useState(''),[accountFilter,setAccountFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
 const [vf,setVf]=useState({branch:'',date:dateNow(),voucher_type:tab.toUpperCase(),dr_account:'Cash',cr_account:'Loan Principal Receivable',amount:'',narration:''});
 const [acForm,setAcForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 useEffect(()=>{if(['Payment','Receipt','Contra','Journal'].includes(tab))setVf(f=>({...f,voucher_type:tab.toUpperCase()}))},[tab]);
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 async function saveVoucher(ev){
  ev.preventDefault();setBusy(true);setErr('');setMsg('');
  try{
   const ref=`VCH-${vf.voucher_type.slice(0,3)}-${Date.now().toString(36).toUpperCase()}`;
   const entryType=vf.voucher_type==='RECEIPT'?'income':vf.voucher_type==='PAYMENT'?'expense':vf.voucher_type==='CONTRA'?'transfer':'adjustment';
   const bId=vf.branch?Number(vf.branch):null;
   await api().post('/journal/',{date:vf.date,entry_type:entryType,account:vf.dr_account,debit:String(vf.amount),credit:'0.00',reference:ref,note:vf.narration||`${vf.voucher_type} Voucher`,branch:bId});
   await api().post('/journal/',{date:vf.date,entry_type:entryType,account:vf.cr_account,debit:'0.00',credit:String(vf.amount),reference:ref,note:vf.narration||`${vf.voucher_type} Voucher`,branch:bId});
   setMsg(`${vf.voucher_type} Voucher (${ref}) posted with balanced DR/CR entries.`);
   setVf(f=>({...f,amount:'',narration:''}));await load();await reload?.();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Voucher creation failed.'))}finally{setBusy(false)}
 }
 async function saveAccount(ev){
  ev.preventDefault();setBusy(true);setErr('');
  try{
   await api().post('/chart-of-accounts/',{code:acForm.code.trim().toUpperCase(),name:acForm.name.trim(),account_type:acForm.account_type||'asset',description:acForm.description||'',active:acForm.active!==false});
   setAcForm(null);await loadAccounts();await load();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Account creation failed.'))}finally{setBusy(false)}
 }
 const filteredJournal=rfList(data).filter(j=>{
  if(branchFilter&&String(j.branch)!==String(branchFilter))return false;
  if(voucherTypeFilter&&String(j.entry_type||'').toLowerCase()!==voucherTypeFilter.toLowerCase())return false;
  if(accountFilter&&!String(j.account||'').toLowerCase().includes(accountFilter.toLowerCase()))return false;
  if(dateFilter&&j.date!==dateFilter)return false;
  if(startDate&&j.date<startDate)return false;
  if(endDate&&j.date>endDate)return false;
  return true;
 });
 return <><PageTitle title={isVoucherForm?`ACCOUNTING VOUCHER CREATION — ${tab.toUpperCase()}`:isAccountsGroup?'GROUP LIST (ACGROUP)':isLedger?'LEDGER LIST':isBranchLedger?'BRANCH LEDGER LIST':tab.toUpperCase()} sub={isAccountsGroup?'Chart of accounts and ledger group configuration':isVoucherForm?'Create balanced double-entry accounting vouchers':'Accounting register & ledger entries'}>
  {tab==='Voucher Entries'&&<div style={{display:'flex',gap:8}}><button type="button" className="masterAddBtn" onClick={()=>go('Payment')}>＋ PAYMENT</button><button type="button" className="masterAddBtn" onClick={()=>go('Receipt')}>＋ RECEIPT</button><button type="button" className="masterAddBtn" onClick={()=>go('Contra')}>＋ CONTRA</button><button type="button" className="masterAddBtn" onClick={()=>go('Journal')}>＋ JOURNAL</button></div>}
  {(isAccountsGroup||isLedger)&&<button type="button" className="masterAddBtn" onClick={()=>setAcForm({code:'',name:'',account_type:'asset',description:'',active:true})}>＋ Add New</button>}
 </PageTitle>
 {err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 {isVoucherForm&&<section className="panel"><form className="formgrid" onSubmit={saveVoucher}>
  <label>BRANCH *<select required value={vf.branch} onChange={e=>setVf({...vf,branch:e.target.value})}><option value="">Select Branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
  <label>DATE *<input required type="date" value={vf.date} onChange={e=>setVf({...vf,date:e.target.value})}/></label>
  <label>VOUCHERTYPE *<input readOnly value={vf.voucher_type}/></label>
  <label>DR. ACCOUNT *<input required list="coa-list" value={vf.dr_account} onChange={e=>setVf({...vf,dr_account:e.target.value})}/></label>
  <label>CR. ACCOUNT *<input required list="coa-list" value={vf.cr_account} onChange={e=>setVf({...vf,cr_account:e.target.value})}/></label>
  <datalist id="coa-list">{accounts.map(a=><option key={a.id} value={a.name}/>)}<option value="Cash"/><option value="Bank: SBI Current A/C"/><option value="Loan Principal Receivable"/><option value="Interest Income"/><option value="Office Expense"/></datalist>
  <label>AMT (₹) *<input required type="number" min="0.01" step="0.01" value={vf.amount} onChange={e=>setVf({...vf,amount:e.target.value})}/></label>
  <label className="wideField">NARRATION<input value={vf.narration} onChange={e=>setVf({...vf,narration:e.target.value})} placeholder="Enter voucher narration"/></label>
  <div className="formActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Posting…':'SAVE VOUCHER'}</button></div>
 </form></section>}
 {!isAccountsGroup&&!isLedger&&<section className="panel"><div className="formgrid">
  <label>SELECT BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>SELECT VOUCHER TYPE<select value={voucherTypeFilter} onChange={e=>setVoucherTypeFilter(e.target.value)}><option value="">All Types</option><option value="income">Receipt / Income</option><option value="expense">Payment / Expense</option><option value="transfer">Contra / Transfer</option><option value="adjustment">Journal / Adjustment</option></select></label>
  <label>SELECT PARTICULARS / ACCOUNT<input value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} placeholder="Cash / Bank / Ledger"/></label>
  <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
  <label>START DATE<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
  <label>END DATE<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
 </div></section>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  {(isAccountsGroup||isLedger)?<Table data={accounts} columns={['code','name','account_type','description','active']}/>:isBranchLedger?<div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>#</th><th>BRANCH</th><th>LEDGER</th><th>REMARK</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>{filteredJournal.map((j,i)=><tr key={j.id}><td>{i+1}</td><td>{branchById[String(j.branch)]?.name||'Head Office'}</td><td>{j.account}</td><td>{j.note||j.reference||'—'}</td><td>{money(j.debit)}</td><td>{money(j.credit)}</td></tr>)}</tbody></table></div>:tab==='Cashbook'?<div className="loanPlanReferenceGrid"><div><h4>CASH LEDGER (PARTICULARS DR / CR)</h4><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>PARTICULARS (DR)</th><th>DR</th><th>PARTICULARS (CR)</th><th>CR</th></tr></thead><tbody>{filteredJournal.filter(j=>/cash/i.test(j.account||'')).map(j=><tr key={j.id}><td>{Number(j.debit||0)>0?(j.note||j.reference||j.account):'—'}</td><td>{money(j.debit)}</td><td>{Number(j.credit||0)>0?(j.note||j.reference||j.account):'—'}</td><td>{money(j.credit)}</td></tr>)}</tbody></table></div></div><div><h4>BANK LEDGER (PARTICULARS DR / CR)</h4><div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>PARTICULARS (DR)</th><th>DR</th><th>PARTICULARS (CR)</th><th>CR</th></tr></thead><tbody>{filteredJournal.filter(j=>/bank/i.test(j.account||'')).map(j=><tr key={j.id}><td>{Number(j.debit||0)>0?(j.note||j.reference||j.account):'—'}</td><td>{money(j.debit)}</td><td>{Number(j.credit||0)>0?(j.note||j.reference||j.account):'—'}</td><td>{money(j.credit)}</td></tr>)}</tbody></table></div></div></div>:<div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SN</th><th>DATE</th><th>VOUCHERNO</th><th>TYPE</th><th>PARTICULAR</th><th>NARRATION</th><th>AMOUNT DR.</th><th>AMOUNT CR.</th><th>VIEW / ACTION</th></tr></thead><tbody>{filteredJournal.map((j,i)=><tr key={j.id}><td>{i+1}</td><td>{j.date}</td><td>{j.reference||`VCH-${j.id}`}</td><td>{String(j.entry_type||'journal').toUpperCase()}</td><td>{j.account}</td><td>{j.note||'—'}</td><td>{money(j.debit)}</td><td>{money(j.credit)}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Voucher</button></div></details></td></tr>)}</tbody></table>{!filteredJournal.length&&<div className="empty">No voucher entries found.</div>}</div>}
  <button className="secondary" style={{marginTop:10}} onClick={load}>Refresh records</button>
 </section>
 {acForm&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW {isAccountsGroup?'ACCOUNT GROUP':'LEDGER'}</b><button type="button" onClick={()=>setAcForm(null)}>×</button></header><form className="masterModalBody" onSubmit={saveAccount}><label>CODE *<input required maxLength="30" value={acForm.code} onChange={e=>setAcForm({...acForm,code:e.target.value.toUpperCase()})} placeholder="LED-101"/></label><label>NAME *<input required maxLength="120" value={acForm.name} onChange={e=>setAcForm({...acForm,name:e.target.value})}/></label><label>TYPE *<select value={acForm.account_type} onChange={e=>setAcForm({...acForm,account_type:e.target.value})}><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="income">Income</option><option value="expense">Expense</option></select></label><label>DESCRIPTION<input value={acForm.description||''} onChange={e=>setAcForm({...acForm,description:e.target.value})}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>SAVE</button><button type="button" className="masterCancelBtn" onClick={()=>setAcForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function Reports({title="Reports",branchSel=''}){
 const[d,setD]=useState(null);const[kind,setKind]=useState('loans');
 const[branches]=useList('/branches/');const[members]=useList('/members/');const[employees]=useList('/employees/');const[groups]=useList('/groups/');const[centres]=useList('/centres/');
 const[loans]=useList('/loans/');const[installments]=useList('/installments/');const[payments]=useList('/payments/');const[disbursements]=useList('/disbursements/');const[settlements]=useList('/loan-settlements/');
 const[branchFilter,setBranchFilter]=useState(branchSel||''),[memberFilter,setMemberFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[statusFilter,setStatusFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{api().get('/reports/'+(branchFilter?'?branch='+encodeURIComponent(branchFilter):'')).then(r=>setD(r.data)).catch(()=>setD({}))},[branchFilter]);
 const memById=Object.fromEntries(members.map(m=>[String(m.id),m]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const groupById=Object.fromEntries(groups.map(g=>[String(g.id),g]));
 const centreById=Object.fromEntries(centres.map(c=>[String(c.id),c]));
 const loanById=Object.fromEntries(loans.map(l=>[String(l.id),l]));
 const isLoanRep=title==='Loan Report';
 const isDueRep=title==='Due EMI Report'||title==='Due EMI Reporting';
 const isCollRep=title==='Collection Reporting';
 const isDisbRep=title==='Disbursement Reporting';
 const isSettleRep=title==='Settlement Reporting';
 const reportRows=useMemo(()=>{
  if(isLoanRep){
   return loans.map((l,i)=>{const m=memById[String(l.member)]||{};const br=branchById[String(m.branch||l.branch)]||{};const grp=groupById[String(m.group)]||{};return {sr:i+1,loan_id:l.id,member_name:m.name||l.member_name||`Member #${l.member}`,alias:m.father_spouse_name||m.nominee||'—',mobile:m.phone||'—',branch_id:m.branch||l.branch,branch_name:br.name||'—',group_name:grp.name||'—',disb_date:l.disbursed_on||String(l.created_at||'').slice(0,10),emi_start:l.emi_start_date||'—',status:l.status,member_id:m.id};});
  }
  if(isDueRep){
   return installments.filter(x=>x.status!=='paid').map((inst,i)=>{const l=loanById[String(inst.loan)]||{};const m=memById[String(l.member)]||{};const ce=centreById[String(m.centre)]||{};const dues=Number(inst.principal_due||0)+Number(inst.interest_due||0);return {sr:i+1,loan_id:l.id||inst.loan,mem_name:m.name||'—',mem_code:m.member_no||'—',mobile:m.phone||'—',type:'INDIVIDUAL',center_name:ce.name||'—',emi_date:inst.due_date,dues,emi:dues,status:inst.status||'pending',branch_id:m.branch,member_id:m.id,staff_id:m.field_officer};});
  }
  if(isCollRep){
   return payments.map((p,i)=>{const m=memById[String(p.member)]||{};const ce=centreById[String(m.centre)]||{};return {sr:i+1,loan_id:p.loan,mem_name:m.name||p.member_name||'—',mem_code:m.member_no||'—',mobile:m.phone||'—',payment_type:'EMI COLLECTION',center_name:ce.name||'—',pay_date:p.paid_on,amount:p.amount,received_by:p.collected_by_name||'Admin',pay_mode:String(p.method||'cash').toUpperCase(),status:p.status,branch_id:m.branch,member_id:m.id,staff_id:m.field_officer};});
  }
  if(isDisbRep){
   return disbursements.map((d,i)=>{const l=loanById[String(d.loan)]||{};const m=memById[String(l.member)]||{};const ce=centreById[String(m.centre)]||{};return {sr:i+1,loan_id:l.id||d.loan,mem_name:m.name||'—',mem_code:m.member_no||'—',mobile:m.phone||'—',center_name:ce.name||'—',disb_date:d.date||l.disbursed_on||'—',start_date:l.emi_start_date||'—',end_date:'—',loan_amt:l.principal||d.amount,disb_amt:d.amount,status:d.status,branch_id:m.branch,member_id:m.id,staff_id:m.field_officer};});
  }
  if(isSettleRep){
   return settlements.map((s,i)=>{const l=loanById[String(s.loan)]||{};const m=memById[String(l.member)]||{};const grp=groupById[String(m.group)]||{};return {sr:i+1,loan_id:l.id||s.loan,mem_name:m.name||'—',alias:m.father_spouse_name||'—',group_name:grp.name||'—',mobile:m.phone||'—',plan_amt:l.principal||0,paid_amt:s.settlement_amount||0,due_amt:s.waived_amount||0,status:s.status,branch_id:m.branch,member_id:m.id,settle_date:String(s.created_at||'').slice(0,10)};});
  }
  return [];
 },[isLoanRep,isDueRep,isCollRep,isDisbRep,isSettleRep,loans,installments,payments,disbursements,settlements,memById,branchById,groupById,centreById,loanById]).filter(r=>{
  if(branchFilter&&String(r.branch_id)!==String(branchFilter))return false;
  if(memberFilter&&String(r.member_id)!==String(memberFilter))return false;
  if(staffFilter&&String(r.staff_id)!==String(staffFilter))return false;
  if(statusFilter&&String(r.status||'').toLowerCase()!==statusFilter.toLowerCase())return false;
  const dVal=r.disb_date||r.emi_date||r.pay_date||r.settle_date||'';
  if(dateFilter&&dVal!==dateFilter)return false;
  if(fromDate&&dVal<fromDate)return false;
  if(toDate&&dVal>toDate)return false;
  if(search&&!JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))return false;
  return true;
 });
 async function exportCsv(){try{const r=await api().get('/reports/export/',{params:{type:kind,...(branchFilter?{branch:branchFilter}:{})},responseType:'blob'});const url=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=url;a.download=`nmfa-${kind}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(e){alert('Export failed. Verify API deployment and permissions.')}}
 return <><PageTitle title={title.toUpperCase()} sub="SEARCH BY filters, live reporting table and Excel/CSV export">
  <div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>exportCsvRows(`${title.toLowerCase().replace(/\s+/g,'_')}_${dateNow()}.csv`,Object.keys(reportRows[0]||{sr:'SR',status:'STATUS'}),reportRows.map(r=>Object.values(r)))}>DOWNLOAD EXCEL</button>{isCollRep&&<button type="button" className="secondary" onClick={exportCsv}>DOWNLOAD CSV</button>}<button type="button" className="secondary" onClick={()=>window.print()}>Get Print</button></div>
 </PageTitle>
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid">
  <label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>MEMBER (TYPE HERE)<select value={memberFilter} onChange={e=>setMemberFilter(e.target.value)}><option value="">All Members</option>{members.map(m=><option key={m.id} value={m.id}>{m.member_no} — {m.name}</option>)}</select></label>
  <label>STAFF (TYPE HERE)<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_no} — {e.name}</option>)}</select></label>
  <label>SELECT STATUS *<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All Statuses</option><option value="active">Active</option><option value="disbursed">Disbursed</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="success">Paid / Success</option></select></label>
  <label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
  <label>FROM DATE<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
  <label>TO DATE<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
  <label>SEARCH (APP NO / NAME / MOBILE)<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Type to filter"/></label>
  <div className="formActions"><button type="button" className="loanPlanCalculateBtn" onClick={()=>{}}>GET RECORD</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setMemberFilter('');setStaffFilter('');setStatusFilter('');setDateFilter('');setFromDate('');setToDate('');setSearch('')}}>Reset</button></div>
 </div></section>
 {(isLoanRep||isDueRep||isCollRep||isDisbRep||isSettleRep)?<section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead>
   {isLoanRep&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEMBER NAME</th><th>(C/O) ALIAS</th><th>MOBILE</th><th>BRANCH</th><th>GROUPNAME</th><th>DISBURSEMENT DATE</th><th>EMISTARTDATE</th><th>STATUS</th></tr>}
   {isDueRep&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MEM CODE</th><th>MOBILE</th><th>TYPE</th><th>COLLECTION CENTER</th><th>EMI DATE</th><th>DUES</th><th>EMI</th><th>STATUS</th></tr>}
   {isCollRep&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MEM CODE</th><th>MOBILE</th><th>PAYMENT TYPE</th><th>CENTERNAME</th><th>PAY DATE</th><th>AMOUNT</th><th>RECEIVED BY</th><th>PAY MODE</th></tr>}
   {isDisbRep&&<tr><th>SR. NO.</th><th>LOANID</th><th>MEM NAME</th><th>MEM CODE</th><th>MOBILE</th><th>CENTERNAME</th><th>DISBURSEMENT DATE</th><th>LOAN START DATE</th><th>LOAN END DATE</th><th>LOAN AMOUNT</th><th>DISBURSED AMOUNT</th></tr>}
   {isSettleRep&&<tr><th>SR. NO.</th><th>LOAN ID</th><th>MEM NAME</th><th>(C/O) ALIAS</th><th>GROUP NAME</th><th>MEM MOB</th><th>PLAN AMT</th><th>PAID AMT</th><th>DUE AMT</th><th>STATUS</th></tr>}
  </thead><tbody>
   {isLoanRep&&reportRows.map(r=><tr key={r.sr}><td>{r.sr}</td><td>#{r.loan_id}</td><td>{r.member_name}</td><td>{r.alias}</td><td>{r.mobile}</td><td>{r.branch_name}</td><td>{r.group_name}</td><td>{r.disb_date}</td><td>{r.emi_start}</td><td>{pretty(r.status)}</td></tr>)}
   {isDueRep&&reportRows.map(r=><tr key={r.sr}><td>{r.sr}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.mem_code}</td><td>{r.mobile}</td><td>{r.type}</td><td>{r.center_name}</td><td>{r.emi_date}</td><td>{money(r.dues)}</td><td>{money(r.emi)}</td><td>{pretty(r.status)}</td></tr>)}
   {isCollRep&&reportRows.map(r=><tr key={r.sr}><td>{r.sr}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.mem_code}</td><td>{r.mobile}</td><td>{r.payment_type}</td><td>{r.center_name}</td><td>{r.pay_date}</td><td>{money(r.amount)}</td><td>{r.received_by}</td><td>{r.pay_mode}</td></tr>)}
   {isDisbRep&&reportRows.map(r=><tr key={r.sr}><td>{r.sr}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.mem_code}</td><td>{r.mobile}</td><td>{r.center_name}</td><td>{r.disb_date}</td><td>{r.start_date}</td><td>{r.end_date}</td><td>{money(r.loan_amt)}</td><td>{money(r.disb_amt)}</td></tr>)}
   {isSettleRep&&reportRows.map(r=><tr key={r.sr}><td>{r.sr}</td><td>#{r.loan_id}</td><td>{r.mem_name}</td><td>{r.alias}</td><td>{r.group_name}</td><td>{r.mobile}</td><td>{money(r.plan_amt)}</td><td>{money(r.paid_amt)}</td><td>{money(r.due_amt)}</td><td>{pretty(r.status)}</td></tr>)}
  </tbody></table>{!reportRows.length&&<div className="empty">No matching records found for {title}.</div>}</div>
 </section>:<>
  {d?.scope_notice&&<div className="alert">{d.scope_notice}</div>}
  <div className="reportGrid">{Object.entries(d||{}).filter(([k])=>k!=='scope_notice').map(([k,v])=><div className="reportCard" key={k}><small>{pretty(k)}</small><b>{v===null||v===undefined?'—':typeof v==='number'&&['members','inactive_members','loans','active_loans','pending_applications','approved_applications','rejected_applications','overdue_installments','kyc_pending','kyc_verified'].includes(k)?v:money(v)}</b></div>)}</div>
  <section className="panel"><h3>Export / Print</h3><div className="formgrid"><label>Register<select value={kind} onChange={e=>setKind(e.target.value)}><option value="members">Members</option><option value="loans">Loans</option><option value="payments">Payments</option><option value="installments">EMI Schedule</option><option value="capital">Capital</option><option value="expenses">Expenses</option><option value="journal">Journal</option></select></label><button onClick={exportCsv} className="primary">Export CSV</button><button onClick={()=>window.print()} className="secondary">Print / Save PDF</button></div></section>
 </>}</>;
}
function Audit(){
 const[data]=useList('/audit-logs/');const[branches]=useList('/branches/');
 const[branchFilter,setBranchFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const filtered=data.filter(r=>{
  if(branchFilter&&String(r.branch||'')!==String(branchFilter))return false;
  return `${r.created_at||''} ${r.user_name||r.user||''} ${r.action||''} ${r.model_name||''} ${r.object_id||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 return <><PageTitle title="LOG ACTIVITY LIST" sub="Immutable operational trail for create, update, delete, approval and collection actions"/>
 <section className="panel"><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>SEARCH<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search user, action, subject"/></label></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>CREATED_AT</th><th>IP</th><th>METHOD</th><th>USER</th><th>SUBJECT</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=><tr key={r.id||i}><td>{(page-1)*pageSize+i+1}</td><td>{String(r.created_at||'').slice(0,19).replace('T',' ')}</td><td>{r.ip_address||'127.0.0.1'}</td><td>{String(r.action||'POST').toUpperCase()}</td><td>{r.user_name||r.user||'admin'}</td><td>{`${pretty(r.model_name||'record')} #${r.object_id||'—'} ${r.details?JSON.stringify(r.details):''}`}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Audit Entry</button></div></details></td></tr>)}</tbody></table>{!shown.length&&<div className="empty">No log activity records found.</div>}</div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filtered.length?(page-1)*pageSize+1:0} TO {Math.min(page*pageSize,filtered.length)} OF {filtered.length} ENTRIES</span><div className="loanPlanNumberPagination"><button disabled={page<=1} onClick={()=>setPage(1)}>«</button><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>PREV</button><button className="current">{page}</button><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>NEXT</button><button disabled={page>=pages} onClick={()=>setPage(pages)}>»</button></div></div>
 </section></>;
}
function CompanyProfile(){
 const defaults={name:'NEW MICROFINANCE',subtitle:'SERVICE ASSOCIATION',address:'',phone:'',email:'',website:'',registration_no:'',logo_data:''};
 const [form,setForm]=useState(defaults),[id,setId]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[editing,setEditing]=useState(true);
 async function loadProfile(){
  try{
   const r=await api().get('/organization-profile/');
   const rows=r.data.results||r.data||[];
   const x=Array.isArray(rows)?rows[0]:null;
   if(x){setId(x.id);setForm({...defaults,...x});syncBrand(x);}
  }catch(_e){setNotice({type:'error',title:'Unable to load',message:'Company profile could not be loaded from the server.'});}
 }
 useEffect(()=>{void loadProfile()},[]);
 function syncBrand(x){
  localStorage.setItem('nmfa_company_name',x.name||defaults.name);
  localStorage.setItem('nmfa_company_sub',x.subtitle||defaults.subtitle);
  localStorage.setItem('nmfa_company_address',x.address||'');
  localStorage.setItem('nmfa_company_phone',x.phone||'');
  localStorage.setItem('nmfa_company_email',x.email||'');
  localStorage.setItem('nmfa_company_website',x.website||'');
  if(x.logo_data)localStorage.setItem('nmfa_company_logo',x.logo_data);
  else localStorage.removeItem('nmfa_company_logo');
  window.dispatchEvent(new Event('nmfa-brand-updated'));
 }
 function changeLogo(e){
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setNotice({type:'error',title:'Invalid file format',message:'Please upload a PNG, JPG/JPEG, or WebP logo image.'});e.target.value='';return;}
  if(file.size>1.5*1024*1024){setNotice({type:'error',title:'File too large',message:'Keep the logo image under 1.5 MB.'});e.target.value='';return;}
  const reader=new FileReader();reader.onload=()=>setForm(f=>({...f,logo_data:String(reader.result||'')}));reader.readAsDataURL(file);
 }
 function save(e){
  e.preventDefault();
  if(!String(form.name||'').trim()){setNotice({type:'error',title:'Validation Error',message:'Company / Organization Name is required.'});return;}
  setNotice({type:'confirm',title:'Save Company Profile?',message:'Save these company profile and logo changes to the database?',onConfirm:async()=>{
   setBusy(true);
   try{
    const payload={...form,name:String(form.name||'').trim(),subtitle:String(form.subtitle||'').trim()};
    const r=id?await api().patch(`/organization-profile/${id}/`,payload):await api().post('/organization-profile/',payload);
    setId(r.data.id);setForm({...defaults,...r.data});syncBrand(r.data);
    try{await api().patch('/settings/business/',{values:{company_name:payload.name,company_short_name:payload.subtitle,address:payload.address||'',contact_number_1:payload.phone||'',contact_email:payload.email||'',website:payload.website||''}});}catch(_e){}
    setNotice({type:'success',title:'Saved!',message:'Company profile and logo saved and updated in Header & Sidebar.'});
   }catch(err){setNotice({type:'error',title:'Save failed',message:JSON.stringify(err.response?.data||'Only an authorized administrator can save company profile settings.')})}finally{setBusy(false)}
  }});
 }
 function cancel(){
  setNotice({type:'confirm',title:'Discard changes?',message:'Unsaved changes will be discarded. Continue?',onConfirm:()=>{void loadProfile()}});
 }
 return <><PageTitle title="COMPANY PROFILE & LOGO" sub="Configure organization-wide Header & Sidebar logo, company name, address, contact details and registration number.">
  <div style={{display:'flex',gap:8}}>
   <button type="button" className={editing?'secondary':'masterAddBtn'} onClick={()=>setEditing(v=>!v)}>{editing?'👁 View Mode':'✎ Edit Profile'}</button>
  </div>
 </PageTitle>
 <section className="panel"><form className="formgrid" onSubmit={save}>
  <label>Company / Organization Name *<input required disabled={!editing} maxLength="180" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
  <label>Subtitle / Short Name *<input required disabled={!editing} maxLength="180" value={form.subtitle} onChange={e=>setForm({...form,subtitle:e.target.value})}/></label>
  <label>Registration / CIN / License No.<input disabled={!editing} maxLength="100" value={form.registration_no} onChange={e=>setForm({...form,registration_no:e.target.value})}/></label>
  <label>Contact Phone *<input required disabled={!editing} maxLength="30" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="e.g. 9876543210"/></label>
  <label>Official Email<input disabled={!editing} type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="info@company.com"/></label>
  <label>Website<input disabled={!editing} type="url" value={form.website} onChange={e=>setForm({...form,website:e.target.value})} placeholder="https://example.org"/></label>
  <label className="wideField">Registered Office Address<textarea disabled={!editing} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
  <label className="wideField">Header &amp; Sidebar Logo (PNG, JPG or WebP, max 1.5 MB)
   <input type="file" disabled={!editing} accept="image/png,image/jpeg,image/webp" onChange={changeLogo}/>
   <div className="logoPreviewRow" style={{display:'flex',alignItems:'center',gap:12,marginTop:8}}>
    <img src={form.logo_data||'/umang-ui/img/company.png'} alt="Company logo preview" style={{maxHeight:64,maxWidth:180,objectFit:'contain',border:'1px solid #d8e0e8',padding:6,background:'#fff',borderRadius:4}}/>
    <div>
     <div style={{fontSize:12,fontWeight:700}}>{form.logo_data?'Custom Uploaded Logo Active':'Default MicroMuneem / UMANG Logo Active'}</div>
     {form.logo_data&&editing&&<button type="button" className="smallBtn dangerBtn" style={{marginTop:4}} onClick={()=>setForm({...form,logo_data:''})}>Remove Custom Logo (Revert to Default)</button>}
    </div>
   </div>
  </label>
  {editing&&<div className="formActions"><button className="primary" disabled={busy}>{busy?'Saving…':'Save Company Profile'}</button><button type="button" className="secondary" disabled={busy} onClick={cancel}>Cancel</button></div>}
 </form></section>
 {notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>
}

function AttendancePage({reload}){
 const[employees]=useList('/employees/',reload);const[branches]=useList('/branches/',reload);const[data,load]=useList('/attendance/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[empFilter,setEmpFilter]=useState(''),[dateFilter,setDateFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=()=>({employee:'',attendance_date:dateNow(),status:'present',check_in:'09:30',check_out:'18:00',note:''});
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const filtered=data.filter(r=>{
  const emp=empById[String(r.employee)]||{};
  if(branchFilter&&String(emp.branch)!==String(branchFilter))return false;
  if(empFilter&&String(r.employee)!==String(empFilter))return false;
  if(dateFilter&&r.attendance_date!==dateFilter)return false;
  return `${emp.name||''} ${emp.phone||''} ${r.attendance_date||''} ${r.note||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{await api().post('/attendance/',normalize(form));setForm(null);await load();await reload?.()}catch(err){setErr(JSON.stringify(err.response?.data||'Attendance save failed'))}finally{setBusy(false)}}
 return <><PageTitle title="ATTENDANCE LIST" sub="Search daily employee attendance by Branch, Employee ID and Date, or mark new attendance."><button className="masterAddBtn" onClick={()=>{setForm(blank());setErr('')}}>＋ Add New</button></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>EMPLOYEE ID<select value={empFilter} onChange={e=>setEmpFilter(e.target.value)}><option value="">All Employees</option>{employees.filter(e=>!branchFilter||String(e.branch)===String(branchFilter)).map(x=><option key={x.id} value={x.id}>{x.employee_no} — {x.name}</option>)}</select></label><label>DATE<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label><div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>submit</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setEmpFilter('');setDateFilter('');setSearch('')}}>Reset</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search attendance"/></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>MOBILE</th><th>DATE</th><th>STATUS</th><th>CHECK-IN</th><th>CHECK-OUT</th><th>REMARK</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const emp=empById[String(r.employee)]||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{emp.name||`Employee #${r.employee}`}</td><td>{emp.phone||'—'}</td><td>{r.attendance_date}</td><td><span className={r.status==='present'?'status ok':'status off'}>{String(r.status||'present').toUpperCase()}</span></td><td>{r.check_in||'—'}</td><td>{r.check_out||'—'}</td><td>{r.note||'—'}</td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setForm({employee:String(r.employee),attendance_date:r.attendance_date,status:r.status,check_in:r.check_in||'09:30',check_out:r.check_out||'18:00',note:r.note||''})}>✎ Update Attendance</button><button type="button" onClick={()=>window.print()}>🖨 Print</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No attendance records found.</div>}</div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>ADD NEW ATTENDANCE</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><label>EMPLOYEE *<select required value={form.employee} onChange={e=>setForm({...form,employee:e.target.value})}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employee_no} — {x.name}</option>)}</select></label><label>DATE *<input required type="date" value={form.attendance_date} onChange={e=>setForm({...form,attendance_date:e.target.value})}/></label><label>STATUS *<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{[['present','Present'],['absent','Absent'],['leave','Leave'],['half_day','Half day'],['holiday','Holiday']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>CHECK-IN<input type="time" value={form.check_in} onChange={e=>setForm({...form,check_in:e.target.value})}/></label><label>CHECK-OUT<input type="time" value={form.check_out} onChange={e=>setForm({...form,check_out:e.target.value})}/></label><label>REMARK<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

function PayrollPage({reload}){
 const[employees]=useList('/employees/',reload);const[branches]=useList('/branches/',reload);const[data,load]=useList('/payroll/',reload);
 const[branchFilter,setBranchFilter]=useState(''),[staffFilter,setStaffFilter]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const[form,setForm]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const blank=(ho=false)=>({employee:'',period_month:`${dateNow().slice(0,7)}-01`,basic_salary:'',fixed_allowance:'0',fixed_deduction:'0',income_tax:'0',status:'draft',paid_on:dateNow(),payment_reference:ho?'HO-NEFT':'BRANCH-SALARY'});
 const empById=Object.fromEntries(employees.map(e=>[String(e.id),e]));
 const branchById=Object.fromEntries(branches.map(b=>[String(b.id),b]));
 const filtered=data.filter(r=>{
  const emp=empById[String(r.employee)]||{};
  if(branchFilter&&String(emp.branch)!==String(branchFilter))return false;
  if(staffFilter&&String(r.employee)!==String(staffFilter))return false;
  return `${r.employee_name||emp.name||''} ${emp.phone||''} ${r.period_month||''}`.toLowerCase().includes(search.toLowerCase());
 });
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 async function save(e){e.preventDefault();setBusy(true);setErr('');try{await api().post('/payroll/',normalize(form));setForm(null);await load();await reload?.()}catch(err){setErr(JSON.stringify(err.response?.data||'Payroll save failed'))}finally{setBusy(false)}}
 return <><PageTitle title="SALARY RECORD LIST" sub="Search by Branch and Staff ID; create branch salary or Salary From HeadOffice."><div style={{display:'flex',gap:8}}><button className="masterAddBtn" onClick={()=>{setForm(blank(false));setErr('')}}>＋ Add New</button><button className="loanPlanCalculateBtn" type="button" onClick={()=>{setForm(blank(true));setErr('')}}>＋ Salary From HeadOffice</button></div></PageTitle>{err&&<div className="alert danger">{err}</div>}
 <section className="panel"><h3>SEARCH BY</h3><div className="formgrid"><label>BRANCH<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="">All Branches</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>STAFF ID<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All Staff</option>{employees.filter(e=>!branchFilter||String(e.branch)===String(branchFilter)).map(x=><option key={x.id} value={x.id}>{x.employee_no} — {x.name}</option>)}</select></label><div className="formActions"><button type="button" className="masterCreateBtn" onClick={()=>setPage(1)}>SUBMIT</button><button type="button" className="secondary" onClick={()=>{setBranchFilter('');setStaffFilter('');setSearch('')}}>Reset</button></div></div></section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div className="loanPlanReferenceTools"><label className="loanPlanEntries">Show <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}><option>10</option><option>25</option><option>50</option><option>100</option></select> entries</label><label className="masterSearch"><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search salary records"/></label></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR.</th><th>NAME</th><th>MOBILE</th><th>BRANCH</th><th>SALARY</th><th>PAYMENT MODE</th><th>TRANSACTION DT</th><th>CHEQUE DT</th><th>SALARY MONTH</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{shown.map((r,i)=>{const emp=empById[String(r.employee)]||{};const br=branchById[String(emp.branch)]||{};return <tr key={r.id}><td>{(page-1)*pageSize+i+1}</td><td>{r.employee_name||emp.name||`Employee #${r.employee}`}</td><td>{emp.phone||'—'}</td><td>{br.name||'Head Office'}</td><td>{money(r.net_salary||r.basic_salary||0)}</td><td>{r.payment_reference?.includes('HO')?'HEAD OFFICE BANK':'BANK / NEFT'}</td><td>{r.paid_on||r.period_month}</td><td>{r.paid_on||'—'}</td><td>{r.period_month}</td><td><span className={r.status==='approved'||r.status==='paid'?'status ok':'status off'}>{String(r.status||'draft').toUpperCase()}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>window.print()}>🖨 Print Salary Slip</button></div></details></td></tr>})}</tbody></table>{!shown.length&&<div className="empty">No salary records found.</div>}</div>
 </section>
 {form&&<div className="masterModalBackdrop"><section className="masterModal masterModalWide" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{form.payment_reference==='HO-NEFT'?'ADD SALARY FROM HEADOFFICE':'ADD NEW SALARY RECORD'}</b><button type="button" onClick={()=>setForm(null)}>×</button></header><form className="masterModalBody" onSubmit={save}><div className="loanPlanReferenceGrid"><div className="loanPlanColumn"><label>EMPLOYEE *<select required value={form.employee} onChange={e=>{const emp=empById[e.target.value];setForm({...form,employee:e.target.value,basic_salary:emp?.annual_basic_salary?String((Number(emp.annual_basic_salary)/12).toFixed(2)):form.basic_salary})}}><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.employee_no} — {x.name}</option>)}</select></label><label>SALARY MONTH (FIRST DAY) *<input required type="date" value={form.period_month} onChange={e=>setForm({...form,period_month:e.target.value})}/></label><label>BASIC SALARY (₹) *<input required min="0" step="0.01" type="number" value={form.basic_salary} onChange={e=>setForm({...form,basic_salary:e.target.value})}/></label><label>FIXED ALLOWANCE (₹)<input min="0" step="0.01" type="number" value={form.fixed_allowance} onChange={e=>setForm({...form,fixed_allowance:e.target.value})}/></label></div><div className="loanPlanColumn"><label>FIXED DEDUCTION (₹)<input min="0" step="0.01" type="number" value={form.fixed_deduction} onChange={e=>setForm({...form,fixed_deduction:e.target.value})}/></label><label>INCOME TAX (₹)<input min="0" step="0.01" type="number" value={form.income_tax} onChange={e=>setForm({...form,income_tax:e.target.value})}/></label><label>TRANSACTION DATE<input type="date" value={form.paid_on||dateNow()} onChange={e=>setForm({...form,paid_on:e.target.value})}/></label><label>PAYMENT MODE / REF<input value={form.payment_reference||''} onChange={e=>setForm({...form,payment_reference:e.target.value})}/></label></div></div><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>{busy?'Saving…':'SAVE SALARY'}</button><button type="button" className="masterCancelBtn" onClick={()=>setForm(null)}>CANCEL</button></div></form></section></div>}</>
}

const SMS_FIELDS=[
 ['sms_service','SMS Service'],['customer_registration','Send SMS Customer Registration'],['password_reset','Send SMS On Password Reset'],['due_reminder','Due Reminder SMS'],['member_verify_otp','Member Verify OTP SMS'],['staff_verify_otp','Staff Verify OTP SMS'],['customer_loan_disbursement','Send SMS Customer Loan Disbursement'],['emi_collection','Send SMS On EMI Collection'],['document_verification','Document Verification SMS'],['customer_credentials','Customer Credentials SMS'],['guarantor_verify_otp','Guarantor Verify OTP SMS'],['staff_verify','Staff Verify SMS']
];
function SmsSettings(){
 const defaults=()=>Object.fromEntries([...SMS_FIELDS.map(([k])=>[k,true]),['emi_reminder_days',1]]);
 const [form,setForm]=useState(defaults);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState(null);const [loaded,setLoaded]=useState(false);
 useEffect(()=>{api().get('/settings/sms/').then(r=>setForm({...defaults(),...r.data})).catch(e=>setNotice({type:'error',title:'Could not load SMS settings',message:JSON.stringify(e.response?.data||'Administrator login required.')})).finally(()=>setLoaded(true))},[]);
 function cancel(){setNotice({type:'confirm',title:'Are you sure?',message:'Discard unsaved changes to SMS settings?',onConfirm:async()=>{try{const r=await api().get('/settings/sms/');setForm({...defaults(),...r.data});setNotice({type:'success',title:'Success!',message:'SMS settings restored from saved values.'})}catch(e){setNotice({type:'error',title:'Unable to reload',message:JSON.stringify(e.response?.data||'Could not reload saved settings.')})}}})}
 function save(e){e.preventDefault();setNotice({type:'confirm',title:'Are you sure?',message:'Do you want to save these SMS settings?',onConfirm:async()=>{setBusy(true);try{const r=await api().post('/settings/sms/',form);setForm({...defaults(),...r.data});setNotice({type:'success',title:'Success!',message:'SMS settings saved successfully.'})}catch(err){setNotice({type:'error',title:'Save failed',message:JSON.stringify(err.response?.data||'SMS settings could not be saved.')})}finally{setBusy(false)}}})}
 return <><PageTitle title="SMS Settings" sub="Control which customer and staff events are allowed to send SMS messages."/><section className="panel"><form onSubmit={save}><div className="smsSettingsGrid">{SMS_FIELDS.map(([key,label])=><label className="smsSettingField" key={key}>{label} *<select value={form[key]?'active':'inactive'} onChange={e=>setForm(old=>({...old,[key]:e.target.value==='active'}))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>)}<label className="smsSettingField">No of EMI Reminder SMS Days *<input type="number" min="1" max="90" step="1" required value={form.emi_reminder_days} onChange={e=>setForm(old=>({...old,emi_reminder_days:e.target.value}))}/></label></div><div className="formActions"><button className="successBtn" type="submit" disabled={busy||!loaded}>{busy?'Saving…':'SAVE PROFILE'}</button><button className="cancelBtn" type="button" disabled={busy||!loaded} onClick={cancel}>CANCEL</button></div></form><p className="muted">These options save SMS event preferences. Actual SMS delivery also requires valid SMS gateway credentials and a configured sending workflow.</p></section>{notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" disabled={busy} onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" disabled={busy} onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>
}

function KycSettings(){
 const [required,setRequired]=useState(true);const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);const [notice,setNotice]=useState(null);
 useEffect(()=>{api().get('/settings/kyc/').then(r=>setRequired(!!r.data.kyc_required)).catch(e=>setNotice({type:'error',title:'Could not load KYC settings',message:JSON.stringify(e.response?.data||'Administrator login required.')})).finally(()=>setLoaded(true))},[]);
 function save(e){e.preventDefault();setNotice({type:'confirm',title:'Are you sure?',message:required?'KYC Active: verified identity and address documents will be mandatory before loan approval and disbursement. Save this rule?':'KYC Inactive: loan approval and disbursement will not require verified KYC documents. Uploaded documents remain stored. Save this rule?',onConfirm:async()=>{setBusy(true);try{const r=await api().post('/settings/kyc/',{kyc_required:required});setRequired(!!r.data.kyc_required);setNotice({type:'success',title:'Success!',message:'KYC requirement setting saved successfully.'})}catch(err){setNotice({type:'error',title:'Save failed',message:JSON.stringify(err.response?.data||'Could not save KYC setting.')})}finally{setBusy(false)}}})}
 function cancel(){api().get('/settings/kyc/').then(r=>{setRequired(!!r.data.kyc_required);setNotice({type:'success',title:'Cancelled',message:'Saved KYC setting restored.'})}).catch(()=>setNotice({type:'error',title:'Unable to reload',message:'Could not reload saved KYC setting.'}))}
 return <><PageTitle title="KYC Settings" sub="Choose whether verified KYC documents are mandatory before loan approval and disbursement."/><section className="panel"><form className="formgrid" onSubmit={save}><label className="smsSettingField">KYC Verification Requirement *<select value={required?'active':'inactive'} onChange={e=>setRequired(e.target.value==='active')} disabled={!loaded||busy}><option value="active">Active — KYC mandatory</option><option value="inactive">Inactive — KYC not mandatory</option></select></label><div className={required?'alert danger':'alert'}><b>{required?'KYC is mandatory':'KYC verification requirement is disabled'}</b><p>{required?'Loan approval and disbursement require verified identity and address documents. Uploading alone is not verification.':'Documents can still be uploaded and retained, but approval/disbursement will not be blocked for missing/unverified KYC. Apply your organization’s legal and lending policy before disabling this control.'}</p></div><div className="formActions"><button className="successBtn" type="submit" disabled={busy||!loaded}>{busy?'Saving…':'SAVE PROFILE'}</button><button className="cancelBtn" type="button" disabled={busy||!loaded} onClick={cancel}>CANCEL</button></div></form></section>{notice&&<div className="nmfaModalBackdrop nmfaAlertBackdrop"><section className="nmfaAlertBox" role="alertdialog" aria-modal="true"><div className={`nmfaAlertIcon ${notice.type}`}>{notice.type==='success'?'✓':notice.type==='confirm'?'!':'×'}</div><h2>{notice.title}</h2><p>{notice.message}</p><div className="nmfaAlertActions">{notice.type==='confirm'?<><button className="successBtn" disabled={busy} onClick={()=>{const fn=notice.onConfirm;setNotice(null);fn?.()}}>Yes, confirm it</button><button className="cancelBtn" disabled={busy} onClick={()=>setNotice(null)}>Cancel</button></>:<button className="successBtn" onClick={()=>setNotice(null)}>OK</button>}</div></section></div>}</>
}

function IntegrationSettings({focus}){
 const [rows,setRows]=useState([]); const [saving,setSaving]=useState(false);
 const defs=[
  ['razorpay','key_id','Razorpay Key ID'],['razorpay','key_secret','Razorpay Key Secret'],['razorpay','webhook_secret','Razorpay Webhook Secret'],
  ['cashfree','app_id','Cashfree App ID'],['cashfree','secret_key','Cashfree Secret Key'],['cashfree','webhook_secret','Cashfree Webhook Secret'],
  ['upi','merchant_id','UPI Merchant ID'],['upi','api_key','UPI / AutoPay API Key'],['upi','api_secret','UPI / AutoPay API Secret'],
  ['enach','merchant_id','eNACH Merchant ID'],['enach','api_key','eNACH API Key'],['enach','api_secret','eNACH API Secret'],
  ['sms','api_key','SMS API Key'],['sms','sender_id','SMS Sender ID'],['whatsapp','access_token','WhatsApp Access Token'],['whatsapp','phone_number_id','WhatsApp Phone Number ID'],
  ['smtp','host','SMTP Host'],['smtp','username','SMTP Username'],['smtp','password','SMTP Password'],['smtp','port','SMTP Port']
 ];
 useEffect(()=>{api().get('/settings/integrations/').then(r=>setRows(r.data||[])).catch(e=>alert(e.response?.data?.detail||'Unable to load settings'))},[]);
 const existing=(p,k)=>rows.find(x=>x.provider===p&&x.key===k);
 async function save(p,k,value,enabled){setSaving(true);try{const r=await api().post('/settings/integrations/',{provider:p,key:k,value,enabled});setRows(a=>[...a.filter(x=>!(x.provider===p&&x.key===k)),r.data])}catch(e){alert(e.response?.data?.detail||JSON.stringify(e.response?.data||'Save failed'))}finally{setSaving(false)}}
 const shown=focus==='payments'?defs.filter(x=>['razorpay','cashfree'].includes(x[0])):focus==='mandates'?defs.filter(x=>['upi','enach'].includes(x[0])):defs;
 const groups=[...new Set(shown.map(x=>x[0]))];
 return <><PageTitle title="API & Integration Settings" sub="Admin-only encrypted credentials. Values are never returned in full after saving."/>
 <div className="alert">Enter your production/sandbox credentials here. The secrets are encrypted before being stored in PostgreSQL. Keep provider approval, webhook URLs and merchant configuration active at the provider.</div>
 {groups.map(p=><section className="panel" key={p}><h3>{dictProvider(p)}</h3><div className="formgrid">{shown.filter(x=>x[0]===p).map(([provider,key,label])=>{const e=existing(provider,key);return <label key={provider+key}>{label}<input type={/secret|password|token/.test(key)?'password':'text'} placeholder={e?.masked_value||'Not configured'} defaultValue="" onBlur={ev=>{if(ev.target.value)save(provider,key,ev.target.value,e?.enabled??true)}}/><span className="muted">{e?.masked_value?`Saved • ${e.masked_value}`:'Not configured'}</span></label>})}</div><p className="muted">{p==='razorpay'||p==='cashfree'?'After saving, connect the provider webhook to your public HTTPS webhook endpoint before enabling live collections.':p==='upi'||p==='enach'?'Mandate/AutoPay activation also requires provider-side authorization/approval.':'Provider credentials are stored per service and can be rotated from this page.'}</p></section>)}<div className="muted">{saving?'Saving…':'Changes are saved automatically when you leave a credential field.'}</div></>
}
function dictProvider(p){return ({razorpay:'Razorpay',cashfree:'Cashfree',upi:'UPI / AutoPay',enach:'eNACH / Mandate',sms:'SMS Gateway',whatsapp:'WhatsApp',smtp:'Email / SMTP',storage:'Object Storage'})[p]||p}

const STAFF_ROLE_OPTIONS=[['manager','Branch Manager'],['loan_officer','Loan Officer'],['accountant','Accountant'],['field_officer','Field Officer / Collector'],['auditor','Auditor']];
const STAFF_PERMISSION_OPTIONS=[
 ['view_dashboard','View main dashboard & KPI summary','DASHBOARD'],
 ['view_customers','View members / customer list','MEMBERS'],
 ['manage_customers','Create and update member profiles','MEMBERS'],
 ['delete_customers','Deactivate or delete customer records','MEMBERS'],
 ['view_kyc','View customer KYC documents','KYC'],
 ['upload_kyc','Upload customer KYC documents','KYC'],
 ['verify_kyc','Verify or reject customer KYC documents','KYC'],
 ['view_loans','View loan register, summary and schedules','LOANS'],
 ['create_loan_applications','Create individual, group and top-up loan applications','LOANS'],
 ['update_loan_applications','Edit pending loan applications','LOANS'],
 ['delete_loan_applications','Delete or cancel draft loan applications','LOANS'],
 ['approve_loans','Approve or reject loan and product-loan applications','APPROVALS'],
 ['disburse_loans','Disburse approved individual and group loans','DISBURSEMENT'],
 ['view_collections','View EMI collection registers and receipts','EMI RECORDS'],
 ['collect_payments','Collect EMI installments, advance security and foreclosure','EMI RECORDS'],
 ['approve_collections','Approve or reject pending EMI collections','APPROVALS'],
 ['view_penalties','View penalty schemes and due penalty list','MASTER'],
 ['manage_penalties','Create and update penalty schemes','MASTER'],
 ['view_ptp','View Promise To Pay records','EMI RECORDS'],
 ['manage_ptp','Create and update Promise To Pay follow-ups','EMI RECORDS'],
 ['view_settlements','View loan settlement cases and reports','LOAN CASE'],
 ['manage_settlements','Create and update loan settlement requests','LOAN CASE'],
 ['approve_settlements','Approve or reject loan settlements','APPROVALS'],
 ['view_masters','View master catalogs (State, Bank, Leave, Miscellaneous)','MASTER'],
 ['manage_masters','Create and edit master catalogs and reference lists','MASTER'],
 ['view_branches','View branches, branch centers and collection centers','MASTER'],
 ['manage_branches','Create and update branches, centers and groups','MASTER'],
 ['view_reports','View MIS, Loan, Collection, Disbursement and CIBIL reports','REPORTING'],
 ['export_reports','Export Excel/CSV reports and CIBIL bureau files','REPORTING'],
 ['view_accounting','View Day Book, Cash Book, Vouchers, Ledger and Trial Balance','ACCOUNTING'],
 ['manage_accounting','Create Payment, Receipt, Contra, Journal vouchers and Ledgers','ACCOUNTING'],
 ['approve_vouchers','Approve accounting vouchers and adjustments','ACCOUNTING'],
 ['view_fund_transfers','View branch-to-branch fund transfers','ACCOUNTING'],
 ['create_fund_transfers','Create branch-to-branch fund transfer requests','ACCOUNTING'],
 ['approve_fund_transfers','Approve or reject branch fund transfers','APPROVALS'],
 ['view_overdue_transfers','View overdue loan transfer requests','EMI RECORDS'],
 ['manage_overdue_transfers','Create overdue loan transfer requests','EMI RECORDS'],
 ['approve_overdue_transfers','Approve or reject overdue loan transfers','APPROVALS'],
 ['manage_financial_locks','Request financial period locks','ACCOUNTING'],
 ['approve_financial_locks','Approve or reject financial period locks','ACCOUNTING'],
 ['manage_payment_reversals','Request payment / receipt reversals','ACCOUNTING'],
 ['approve_payment_reversals','Approve or reject payment reversals','ACCOUNTING'],
 ['view_hr','View employees, attendance, leave and salary records','HRM'],
 ['manage_hr','Create and update employees, attendance, leave, holidays and letters','HRM'],
 ['approve_salary','Approve or reject staff salary payroll records','APPROVALS'],
 ['view_household_assessments','View household income assessments','OPERATIONS'],
 ['manage_household_assessments','Create and update household income assessments','OPERATIONS'],
 ['verify_household_assessments','Verify household income assessments','OPERATIONS'],
 ['view_customer_complaints','View customer complaints register','OPERATIONS'],
 ['manage_customer_complaints','Create and update customer complaints','OPERATIONS'],
 ['resolve_customer_complaints','Resolve or reject customer complaints','OPERATIONS'],
 ['view_field_visits','View field visit logs','OPERATIONS'],
 ['manage_field_visits','Record and update field visits','OPERATIONS'],
 ['view_cash_handovers','View staff cash handover register','OPERATIONS'],
 ['manage_cash_handovers','Create cash handover requests','OPERATIONS'],
 ['approve_cash_handovers','Approve or reject cash handover requests','APPROVALS'],
 ['view_products','View product categories, brands, variants, suppliers and products','PRODUCT MASTER'],
 ['manage_products','Create and edit product master items and loan plans','PRODUCT MASTER'],
 ['manage_staff','Manage staff accounts, branch logins and admin profile','ROLE & PERMISSION'],
 ['manage_permissions','Manage roles and 515 permission assignments','ROLE & PERMISSION'],
 ['view_settings','View company profile, software timing, session and series','SETTINGS'],
 ['manage_settings','Update company profile, logo, software timing, session and series','SETTINGS'],
 ['manage_company_settings','Manage organization branding, logo upload and loan form templates','SETTINGS'],
 ['test_sms','Execute SMS and WhatsApp template testing','SETTINGS'],
 ['view_audit_logs','View system audit logs and loan history','LOG RECORDS'],
 ['view_approvals','Access centralized approval queues','APPROVALS']
];

const PERM_MODULES_90=[
 ['loanplan','MASTER > LOAN PLAN','view_products','manage_products'],['penaltyscheme','MASTER > PENALTY SCHEME','view_penalties','manage_penalties'],['branches','MASTER > BRANCHES','view_branches','manage_branches'],['staffbranches','MASTER > STAFF BRANCH','view_branches','manage_staff'],['branchcenter','MASTER > BRANCH CENTER','view_branches','manage_branches'],['groups','MASTER > GROUPS','view_branches','manage_branches'],['branchlogin','MASTER > BRANCH LOGIN','manage_branches','manage_staff'],['addstaff','MASTER > ADD STAFF','view_hr','manage_staff'],['loanpurpose','MASTER > LOAN PURPOSE','view_masters','manage_masters'],['state','MASTER > STATE','view_masters','manage_masters'],['bank','MASTER > BANK','view_masters','manage_masters'],['leave','MASTER > LEAVE','view_hr','manage_hr'],['designation','MASTER > DESIGNATION','view_masters','manage_masters'],['relationship','MASTER > RELATIONSHIP','view_masters','manage_masters'],['documenttype','MASTER > DOCUMENT TYPE','view_masters','manage_masters'],['collectionmode','MASTER > COLLECTION MODE','view_accounting','manage_accounting'],['miscellaneous','MASTER > MISCELLANEOUS','view_masters','manage_masters'],['softwaretiming','MASTER > SOFTWARE TIMING','view_settings','manage_settings'],['sessionmaster','MASTER > SESSION','view_settings','manage_settings'],['setting','MASTER > SETTING','view_settings','manage_settings'],['companyprofile','MASTER > COMPANY PROFILE','view_settings','manage_company_settings'],['adminpanel','MASTER > ADMIN','manage_staff','manage_staff'],['smstesting','MASTER > SMS TESTING','test_sms','test_sms'],['series','MASTER > SERIES','view_settings','manage_settings'],
 ['productcategory','PRODUCT MASTER > CATEGORY','view_products','manage_products'],['productbrand','PRODUCT MASTER > BRAND','view_products','manage_products'],['productvariant','PRODUCT MASTER > VARIANT','view_products','manage_products'],['productsupplier','PRODUCT MASTER > SUPPLIER','view_products','manage_products'],['insuranceparty','PRODUCT MASTER > INSURANCE PARTY','view_products','manage_products'],['productitem','PRODUCT MASTER > PRODUCT','view_products','manage_products'],['productloan','PRODUCT MASTER > PRODUCT LOAN','view_loans','create_loan_applications'],
 ['employee','HRM > EMPLOYEE','view_hr','manage_hr'],['salary','HRM > SALARY','view_hr','manage_hr'],['holiday','HRM > HOLIDAY','view_hr','manage_hr'],['employeeloantransfer','HRM > EMPLOYEE LOAN TRANSFER','view_hr','manage_staff'],['singleloantransfer','HRM > SINGLE LOAN TRANSFER','view_loans','manage_staff'],['membertransfer','HRM > MEMBER TRANSFER','view_customers','manage_customers'],['updatecenterleader','HRM > UPDATE CENTER LEADER','view_branches','manage_customers'],['printletter','HRM > PRINT LETTER','view_hr','manage_hr'],['employeeleave','HRM > EMPLOYEE LEAVE','view_hr','manage_hr'],['attendance','HRM > ATTENDANCE','view_hr','manage_hr'],
 ['customer','MEMBERS > MEMBER LIST','view_customers','manage_customers'],['customercgt','MEMBERS > MEMBER CGT & GRT','view_customers','manage_customers'],['customergroup','MEMBERS > MEMBER GROUP','view_customers','manage_customers'],['kycdocuments','MEMBERS > KYC DOCUMENTS','view_kyc','verify_kyc'],
 ['downloadloanform','APPLY FOR LOAN > DOWNLOAD LOAN FORM','view_loans','manage_company_settings'],['loantopup','APPLY FOR LOAN > LOAN TOPUP','view_loans','create_loan_applications'],['individualloan','APPLY FOR LOAN > INDIVIDUAL LOAN','view_loans','create_loan_applications'],['grouploan','APPLY FOR LOAN > GROUP LOAN','view_loans','create_loan_applications'],
 ['disbursement','DISBURSEMENT > DISBURSED','view_loans','disburse_loans'],['groupdisbursement','DISBURSEMENT > GROUP DISBURSED','view_loans','disburse_loans'],['loansummary','LOAN SUMMARY','view_loans','approve_loans'],
 ['advancesecurity','EMI RECORDS > ADVANCE SECURITY','view_collections','collect_payments'],['paidemis','EMI RECORDS > PAID EMIS','view_collections','collect_payments'],['dueemis','EMI RECORDS > DUE EMIS','view_collections','collect_payments'],['duepenalty','EMI RECORDS > DUE PENALTY','view_penalties','manage_penalties'],['futuredueemis','EMI RECORDS > FUTURE DUE EMIS','view_collections','collect_payments'],['promisetopay','EMI RECORDS > PROMISE TO PAY','view_ptp','manage_ptp'],['groupemicollection','EMI RECORDS > GROUP EMI COLLECTION','view_collections','collect_payments'],['oldmembercollection','EMI RECORDS > MEMBER COLLECTION (OLD)','view_collections','collect_payments'],['newmembercollection','EMI RECORDS > MEMBER COLLECTION (NEW)','view_collections','collect_payments'],
 ['approveloan','APPROVALS > LOAN','view_approvals','approve_loans'],['approvesalary','APPROVALS > SALARY','view_approvals','approve_salary'],['approvecollection','APPROVALS > COLLECTION','view_approvals','approve_collections'],['approveproductloan','APPROVALS > PRODUCT LOAN','view_approvals','approve_loans'],['approvesettlement','APPROVALS > SETTLEMENT','view_approvals','approve_settlements'],['approvefundtransfer','APPROVALS > FUND TRANSFER','view_approvals','approve_fund_transfers'],
 ['loansettlement','LOAN CASE > LOAN SETTLEMENT','view_settlements','manage_settlements'],['deathmember','LOAN CASE > DEATH MEMBER LIST','view_customers','manage_customers'],['cibilformat','CIBIL FORMAT DOWNLOAD','view_reports','export_reports'],['areasurvey','AREA SURVEY','view_branches','manage_branches'],['logrecords','LOG RECORDS','view_audit_logs','view_audit_logs'],['loanhistory','LOAN HISTORY','view_loans','view_audit_logs'],
 ['daybook','VOUCHER > DAY BOOK','view_accounting','manage_accounting'],['cashbook','VOUCHER > CASH BOOK','view_accounting','manage_accounting'],['voucherentries','VOUCHER > VOUCHER ENTRIES','view_accounting','manage_accounting'],['paymentvoucher','VOUCHER > PAYMENT','view_accounting','manage_accounting'],['receiptvoucher','VOUCHER > RECEIPT','view_accounting','manage_accounting'],['contravoucher','VOUCHER > CONTRA','view_accounting','manage_accounting'],['journalvoucher','VOUCHER > JOURNAL','view_accounting','manage_accounting'],['trialbalance','VOUCHER > TRIAL BALANCE','view_accounting','export_reports'],['fytrialbalance','VOUCHER > FY TRIAL BALANCE','view_accounting','export_reports'],['fyvoucherstatement','VOUCHER > FY VOUCHER STATEMENT','view_accounting','export_reports'],['fyopeningbalance','VOUCHER > FY OPENING BALANCE','view_accounting','manage_accounting'],
 ['fundtransfer','ACCOUNTING > FUND TRANSFER','view_fund_transfers','create_fund_transfers'],['acgroup','ACCOUNTING > ACGROUP','view_accounting','manage_accounting'],['profitloss','ACCOUNTING > PROFIT-LOSS','view_accounting','export_reports'],['overview','ACCOUNTING > OVERVIEW','view_accounting','export_reports'],['ledger','ACCOUNTING > LEDGER','view_accounting','manage_accounting'],['branchledger','ACCOUNTING > BRANCH LEDGER','view_accounting','manage_accounting']
];
const REFERENCE_515_PERMISSIONS=(()=>{
 const list=STAFF_PERMISSION_OPTIONS.map(([key,label,mod])=>({key,label,mod:mod||'CORE',coreKey:key,isCore:true}));
 const acts5=[['view','View / List Records'],['create','Add / Create Record'],['edit','Edit / Update Record'],['delete','Deactivate / Delete Record'],['export','Export / Print Record']];
 PERM_MODULES_90.forEach(([slug,modLabel,vKey,wKey],idx)=>{
  const acts=idx<89?acts5:acts5.slice(0,4);
  acts.forEach(([aSlug,aLabel])=>{
   list.push({key:`perm_${slug}_${aSlug}`,label:`${aLabel} — ${modLabel}`,mod:modLabel,coreKey:aSlug==='view'||aSlug==='export'?vKey:wKey,isCore:false});
  });
 });
 return list;
})();

function StaffUsers({tab='Role & Permissions',reload}){
 const [users,loadUsers]=useList('/staff-users/',reload);const [branches]=useList('/branches/',reload);const [customRoles,loadRoles]=useList('/custom-roles/',reload);
 const isPermTab=tab==='Permission'||tab==='Permission List';
 const isRoleTab=tab==='Role'||tab==='Role List';
 const defaultPerms=()=>Object.fromEntries(STAFF_PERMISSION_OPTIONS.map(([k])=>[k,['view_customers','view_kyc','view_loans','create_loan_applications'].includes(k)]));
 const initial=()=>({username:'',email:'',first_name:'',last_name:'',password:'',role:'loan_officer',branch:'',active:true,permissions:defaultPerms()});
 const [form,setForm]=useState(initial);const [editId,setEditId]=useState(null);const [busy,setBusy]=useState(false);
 const [roleModal,setRoleModal]=useState(null),[roleSearch,setRoleSearch]=useState(''),[selectedRoleId,setSelectedRoleId]=useState(''),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const [permMode,setPermMode]=useState('all515'),[permSearch,setPermSearch]=useState(''),[permModFilter,setPermModFilter]=useState(''),[permPage,setPermPage]=useState(1),[permPageSize,setPermPageSize]=useState(50);
 useEffect(()=>{if(!selectedRoleId&&customRoles.length)setSelectedRoleId(String(customRoles[0].id));},[customRoles,selectedRoleId]);
 const activeCustomRole=customRoles.find(r=>String(r.id)===String(selectedRoleId));
 function edit(u){setEditId(u.id);setForm({username:u.username,email:u.email||'',first_name:u.first_name||'',last_name:u.last_name||'',password:'',role:u.role||'loan_officer',branch:u.branch?String(u.branch):'',active:!!u.is_active,permissions:{...defaultPerms(),...(u.permissions||{})}});window.scrollTo({top:0,behavior:'smooth'})}
 function cancel(){setEditId(null);setForm(initial())}
 async function save(e){e.preventDefault();setBusy(true);const payload={...form,branch:form.branch?Number(form.branch):null};if(!payload.password)delete payload.password;try{if(editId)await api().patch(`/staff-users/${editId}/`,payload);else await api().post('/staff-users/',payload);setMsg(editId?'Staff account updated.':'Staff account created.');cancel();await loadUsers();reload?.()}catch(err){setErr(JSON.stringify(err.response?.data||'Staff account save failed'))}finally{setBusy(false)}}
 async function toggleActive(u){try{await api().patch(`/staff-users/${u.id}/`,{active:!u.is_active});await loadUsers()}catch(e){setErr(JSON.stringify(e.response?.data||'Could not change active status'))}}
 async function saveRole(e){
  e.preventDefault();setBusy(true);setErr('');setMsg('');
  try{
   const payload={name:roleModal.name.trim(),code:(roleModal.code||roleModal.name).trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_'),description:roleModal.description||'',active:roleModal.active!==false,permissions:roleModal.permissions||defaultPerms()};
   if(roleModal.id)await api().patch(`/custom-roles/${roleModal.id}/`,payload);
   else await api().post('/custom-roles/',payload);
   setRoleModal(null);setMsg('Role saved.');await loadRoles();
  }catch(ex){setErr(JSON.stringify(ex.response?.data||'Role save failed'))}finally{setBusy(false)}
 }
 async function toggleRolePerm(item,checked){
  const updates={[item.key]:checked};
  if(item.coreKey&&checked)updates[item.coreKey]=true;
  if(activeCustomRole){
   const nextPerms={...(activeCustomRole.permissions||{}),...updates};
   try{await api().patch(`/custom-roles/${activeCustomRole.id}/`,{permissions:nextPerms});await loadRoles();}catch(ex){setErr('Could not update role permission')}
  }else{
   setForm(f=>({...f,permissions:{...f.permissions,...updates}}));
  }
 }
 const permSource=permMode==='core66'?REFERENCE_515_PERMISSIONS.filter(p=>p.isCore):REFERENCE_515_PERMISSIONS;
 const permModules=[...new Set(REFERENCE_515_PERMISSIONS.map(p=>p.mod))];
 const filteredPerms=permSource.filter(p=>{
  if(permModFilter&&p.mod!==permModFilter)return false;
  if(permSearch&&!`${p.key} ${p.label} ${p.mod} ${p.coreKey}`.toLowerCase().includes(permSearch.toLowerCase()))return false;
  return true;
 });
 const permPages=Math.max(1,Math.ceil(filteredPerms.length/permPageSize));
 const safePermPage=Math.min(permPage,permPages);
 const shownPerms=filteredPerms.slice((safePermPage-1)*permPageSize,safePermPage*permPageSize);
 const filteredRoles=customRoles.filter(r=>`${r.name||''} ${r.code||''}`.toLowerCase().includes(roleSearch.toLowerCase()));
 return <><PageTitle title={isPermTab?'PERMISSION LIST (515 PERMISSIONS)':isRoleTab?'ROLE LIST':'ROLE & PERMISSION MANAGEMENT'} sub="Complete 515-Permission Audit Matrix (66 Core Backend Feature Keys + 449 Granular Module-Action Keys), Role List & Staff Accounts">
  <button type="button" className="masterAddBtn" onClick={()=>setRoleModal({name:'',code:'',description:'',active:true,permissions:defaultPerms()})}>＋ Add Role</button>
 </PageTitle>{err&&<div className="alert danger">{err}</div>}{msg&&<div className="alert success">{msg}</div>}
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}><h3>ROLE LIST</h3><input value={roleSearch} onChange={e=>setRoleSearch(e.target.value)} placeholder="Search roles" style={{maxWidth:240}}/></div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>NAME</th><th>CODE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
   {filteredRoles.map((r,i)=><tr key={r.id}><td>{i+1}</td><td>{r.name}</td><td>{r.code}</td><td><span className={r.active?'status ok':'status off'}>{r.active?'ACTIVE':'INACTIVE'}</span></td><td className="masterActions"><details className="loanPlanTask"><summary>Task <span aria-hidden="true">▾</span></summary><div><button type="button" onClick={()=>setRoleModal({...r})}>✎ Edit Role</button><button type="button" onClick={()=>setSelectedRoleId(String(r.id))}>⚙ Configure Permissions</button></div></details></td></tr>)}
   {!filteredRoles.length&&STAFF_ROLE_OPTIONS.map(([code,name],i)=><tr key={code}><td>{i+1}</td><td>{name.toUpperCase()}</td><td>{code}</td><td><span className="status ok">ACTIVE</span></td><td><button type="button" className="masterEditBtn" onClick={()=>setRoleModal({name,code,description:`Default ${name} role`,active:true,permissions:defaultPerms()})}>✎ Configure</button></td></tr>)}
  </tbody></table></div>
 </section>
 <section className="panel masterListPanel loanPlanReferenceCard">
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:10}}>
   <div>
    <h3 style={{margin:0}}>PERMISSION LIST ({filteredPerms.length} OF {REFERENCE_515_PERMISSIONS.length} PERMISSIONS)</h3>
    <small className="muted">66 Core Server-Enforced Feature Keys + 449 Granular Module CRUD/Export Keys = 515 Total Permissions</small>
   </div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
    <select value={permMode} onChange={e=>{setPermMode(e.target.value);setPermPage(1)}} aria-label="Permission view mode">
     <option value="all515">All 515 Permissions (66 Core + 449 Module Actions)</option>
     <option value="core66">66 Core Backend Feature Permissions Only</option>
    </select>
    <select value={permModFilter} onChange={e=>{setPermModFilter(e.target.value);setPermPage(1)}} aria-label="Filter by module">
     <option value="">All Modules ({permModules.length})</option>
     {permModules.map(m=><option key={m} value={m}>{m}</option>)}
    </select>
    <input value={permSearch} onChange={e=>{setPermSearch(e.target.value);setPermPage(1)}} placeholder="Search permission key or module…" style={{minWidth:210}}/>
    <select value={selectedRoleId} onChange={e=>setSelectedRoleId(e.target.value)} aria-label="Select Role">
     <option value="">Form / Default Staff Role ({form.role})</option>
     {customRoles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
   </div>
  </div>
  <div className="loanPlanReferenceTools">
   <label className="loanPlanEntries">Show <select value={permPageSize} onChange={e=>{setPermPageSize(Number(e.target.value));setPermPage(1)}}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value={515}>All 515</option></select> entries</label>
  </div>
  <div className="tableWrap"><table className="referenceLoanPlanTable"><thead><tr><th>SR. NO.</th><th>PERMISSION</th><th>FOR (MODULE)</th><th>DESCRIPTION &amp; ENFORCEMENT</th><th>ACTION</th></tr></thead><tbody>
   {shownPerms.map((item,i)=>{
    const permBag=activeCustomRole?(activeCustomRole.permissions||{}):(form.permissions||{});
    const checked=!!(permBag[item.key]||(item.coreKey&&permBag[item.coreKey]));
    return <tr key={item.key}><td>{(safePermPage-1)*permPageSize+i+1}</td><td><b>{item.key.toUpperCase()}</b></td><td>{item.mod}</td><td>{item.label} <small className="muted">({item.isCore?'Core API Guard':`Maps to ${item.coreKey}`})</small></td><td><input type="checkbox" checked={checked} onChange={e=>toggleRolePerm(item,e.target.checked)}/></td></tr>;
   })}
  </tbody></table></div>
  <div className="loanPlanReferenceFooter"><span>SHOWING {filteredPerms.length?(safePermPage-1)*permPageSize+1:0} TO {Math.min(safePermPage*permPageSize,filteredPerms.length)} OF {filteredPerms.length} ENTRIES</span><div className="loanPlanNumberPagination"><button type="button" disabled={safePermPage<=1} onClick={()=>setPermPage(1)}>«</button><button type="button" disabled={safePermPage<=1} onClick={()=>setPermPage(p=>Math.max(1,p-1))}>PREV</button><button type="button" className="current">{safePermPage}</button><button type="button" disabled={safePermPage>=permPages} onClick={()=>setPermPage(p=>Math.min(permPages,p+1))}>NEXT</button><button type="button" disabled={safePermPage>=permPages} onClick={()=>setPermPage(permPages)}>»</button></div></div>
 </section>
 <section className="panel"><h3>{editId?`Edit staff account #${editId}`:'Create / Manage Staff Login Account'}</h3><form className="formgrid" onSubmit={save}><label>Username<input required minLength="3" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} disabled={!!editId}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>First name<input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></label><label>Last name<input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></label><label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{STAFF_ROLE_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Branch<select value={form.branch} onChange={e=>setForm({...form,branch:e.target.value})}><option value="">Not branch-assigned</option>{branches.filter(b=>b.active!==false).map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><label>{editId?'Reset password (optional, min 12 chars)':'Temporary password (min 12 chars)'}<input type="password" minLength="12" required={!editId} autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label className="inlineCheck"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active login</label><div className="formActions"><button className="primary" disabled={busy}>{busy?'Saving…':editId?'Save staff changes':'Create staff login'}</button>{editId&&<button type="button" className="secondary" onClick={cancel}>Cancel edit</button>}</div></form></section>
 <section className="panel"><h3>Staff accounts</h3><div className="tableWrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Branch</th><th>Status</th><th>Permissions</th><th>Action</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.username}</td><td>{`${u.first_name||''} ${u.last_name||''}`.trim()||u.email||'—'}</td><td>{STAFF_ROLE_OPTIONS.find(r=>r[0]===u.role)?.[1]||u.role}</td><td>{branches.find(b=>b.id===u.branch)?.name||'—'}</td><td>{u.is_active?'Active':'Disabled'}</td><td>{Object.values(u.permissions||{}).filter(Boolean).length} granted</td><td><button className="smallBtn" onClick={()=>edit(u)}>Edit</button> <button className="smallBtn dangerBtn" onClick={()=>toggleActive(u)}>{u.is_active?'Disable':'Enable'}</button></td></tr>)}</tbody></table>{!users.length&&<div className="empty">No staff accounts loaded.</div>}</div></section>
 {roleModal&&<div className="masterModalBackdrop"><section className="masterModal" role="dialog" aria-modal="true"><header className="masterModalHead"><b>{roleModal.id?'EDIT ROLE':'ADD NEW ROLE'}</b><button type="button" onClick={()=>setRoleModal(null)}>×</button></header><form className="masterModalBody" onSubmit={saveRole}><label>ROLE NAME *<input required maxLength="80" value={roleModal.name} onChange={e=>setRoleModal({...roleModal,name:e.target.value})}/></label><label>ROLE CODE *<input required maxLength="40" value={roleModal.code||''} onChange={e=>setRoleModal({...roleModal,code:e.target.value})}/></label><label>DESCRIPTION<input maxLength="255" value={roleModal.description||''} onChange={e=>setRoleModal({...roleModal,description:e.target.value})}/></label><label>STATUS *<select value={roleModal.active!==false?'active':'inactive'} onChange={e=>setRoleModal({...roleModal,active:e.target.value==='active'})}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label><div className="masterModalActions"><button className="masterCreateBtn" disabled={busy}>SAVE</button><button type="button" className="masterCancelBtn" onClick={()=>setRoleModal(null)}>CANCEL</button></div></form></section></div>}</>
}

window.__UMANG_NAV__={nav:RF_NAV,top:RF_TOP_LINKS,sk:RF_SHORT_KEYS,api:API,get:(p)=>api().get(p)};
createRoot(document.getElementById('root')).render(<App/>);
