/**
 * REOS Enterprise v4.2.2 - Lead Deduplication
 * Sprint 7.1 Increment 3
 */
var REOS = REOS || {};

REOS.LeadDeduplication = (function () {
  var AUDIT='LEAD_DEDUPLICATION_AUDIT';
  var HEADERS=['Deduplication ID','Candidate Lead ID','Matched Lead ID','Confidence','Score','Match Reasons','Action','Candidate JSON','Matched JSON','Created At'];
  function ensureSheets(){ REOS.Database.ensureTable(AUDIT,HEADERS); return {ok:true,audit:AUDIT}; }
  function s_(v){ return String(v==null?'':v).trim(); }
  function norm_(lead){
    if(!REOS.LeadNormalization) throw new Error('LeadNormalization.gs is required.');
    return REOS.LeadNormalization.normalize(lead||{}).record;
  }
  function similarity_(a,b){
    a=s_(a).toLowerCase().replace(/[^a-z0-9]/g,''); b=s_(b).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!a||!b) return 0; if(a===b) return 1;
    var shorter=a.length<b.length?a:b, longer=a.length<b.length?b:a;
    var hits=0; for(var i=0;i<shorter.length;i++){ if(longer.indexOf(shorter.charAt(i))!==-1) hits++; }
    return hits/Math.max(longer.length,1);
  }
  function compare(candidate,existing){
    var c=norm_(candidate), e=norm_(existing), score=0, reasons=[];
    if(c.parcelId&&e.parcelId&&c.parcelId===e.parcelId){ score+=60; reasons.push('Parcel/APN exact'); }
    if(c.normalizedKey&&e.normalizedKey&&c.normalizedKey===e.normalizedKey){ score+=55; reasons.push('Property address exact'); }
    else {
      var as=similarity_(c.address,e.address);
      if(as>=0.9&&c.city===e.city&&c.state===e.state){ score+=40; reasons.push('Property address high similarity'); }
    }
    if(c.ownerName&&e.ownerName){ var os=similarity_(c.ownerName,e.ownerName); if(os===1){score+=20;reasons.push('Owner exact');} else if(os>=0.85){score+=12;reasons.push('Owner similar');} }
    if(c.ownerMailingAddress&&e.ownerMailingAddress&&similarity_(c.ownerMailingAddress,e.ownerMailingAddress)>=0.9){ score+=10; reasons.push('Mailing address similar'); }
    if(c.phone&&e.phone&&c.phone===e.phone){ score+=10; reasons.push('Phone exact'); }
    if(c.email&&e.email&&c.email===e.email){ score+=10; reasons.push('Email exact'); }
    score=Math.min(score,100);
    var confidence=score>=90?'Exact':score>=70?'High':score>=45?'Medium':score>=25?'Low':'None';
    return {isDuplicate:score>=70,confidence:confidence,score:score,reasons:reasons,candidate:c,existing:e};
  }
  function findBest(candidate, rows){
    rows=rows||[]; var best=null;
    rows.forEach(function(row){ var m=compare(candidate,row); if(!best||m.score>best.score) best=Object.assign({matched:row},m); });
    return best||{isDuplicate:false,confidence:'None',score:0,reasons:[],matched:null};
  }
  function mergeDistress_(a,b){
    var values=[];
    [a,b].forEach(function(v){ s_(v).split(/[;,|]/).forEach(function(x){ x=s_(x); if(x&&values.indexOf(x)===-1) values.push(x); }); });
    return values.join('; ');
  }
  function evaluateAndRecord(candidate, existingRows, options){
    options=options||{}; ensureSheets();
    var best=findBest(candidate,existingRows);
    var action=best.isDuplicate?(options.merge?'Merge':'Skip'):'Import';
    REOS.Database.insert(AUDIT,{
      'Candidate Lead ID':candidate['Distress Lead ID']||candidate.id||'',
      'Matched Lead ID':best.matched?(best.matched['Distress Lead ID']||best.matched.id||''):'',
      'Confidence':best.confidence,'Score':best.score,'Match Reasons':best.reasons.join('; '),'Action':action,
      'Candidate JSON':JSON.stringify(candidate),'Matched JSON':JSON.stringify(best.matched||{}),'Created At':new Date()
    },{idField:'Deduplication ID',idPrefix:'DEDUP'});
    if(best.isDuplicate&&options.merge&&best.matched&&options.sheetName&&options.idField){
      var merged={
        'Distress Type':mergeDistress_(best.matched['Distress Type'],candidate['Distress Type']),
        'Lead Source':mergeDistress_(best.matched['Lead Source'],candidate['Lead Source']),
        'Notes':mergeDistress_(best.matched.Notes,candidate.Notes)
      };
      REOS.Database.update(options.sheetName,options.idField,best.matched[options.idField],merged);
    }
    return Object.assign({ok:true,action:action},best);
  }
  function scanSheet(sheetName,idField){
    ensureSheets(); var rows=REOS.Database.getAll(sheetName), seen=[], duplicates=[];
    rows.forEach(function(row){ var best=findBest(row,seen); if(best.isDuplicate) duplicates.push({candidateId:row[idField],matchedId:best.matched[idField],confidence:best.confidence,score:best.score,reasons:best.reasons}); else seen.push(row); });
    return {ok:true,sheet:sheetName,total:rows.length,unique:seen.length,duplicates:duplicates.length,matches:duplicates};
  }
  return {ensureSheets:ensureSheets,compare:compare,findBest:findBest,evaluateAndRecord:evaluateAndRecord,scanSheet:scanSheet};
})();

function reosLeadDeduplicationEnsureSheets(){ return REOS.LeadDeduplication.ensureSheets(); }
function reosCompareLeads(candidate, existing){ return REOS.LeadDeduplication.compare(candidate, existing); }
function reosFindDuplicateLead(candidate, rows){ return REOS.LeadDeduplication.findBest(candidate, rows); }
function reosScanDistressLeadDuplicates(){ return REOS.LeadDeduplication.scanSheet('DISTRESS_LEADS','Distress Lead ID'); }
