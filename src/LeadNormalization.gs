/**
 * REOS Enterprise v4.2.2 - Lead Normalization
 * Sprint 7.1 Increment 3
 */
var REOS = REOS || {};

REOS.LeadNormalization = (function () {
  var AUDIT = 'LEAD_NORMALIZATION_AUDIT';
  var HEADERS = ['Normalization ID','Source','Source Record ID','Original JSON','Normalized JSON','Warnings JSON','Created At'];
  var SUFFIXES = {street:'St',st:'St',avenue:'Ave',ave:'Ave',road:'Rd',rd:'Rd',boulevard:'Blvd',blvd:'Blvd',drive:'Dr',dr:'Dr',lane:'Ln',ln:'Ln',court:'Ct',ct:'Ct',place:'Pl',pl:'Pl',parkway:'Pkwy',pkwy:'Pkwy',highway:'Hwy',hwy:'Hwy',terrace:'Ter',ter:'Ter',circle:'Cir',cir:'Cir'};

  function ensureSheets(){ REOS.Database.ensureTable(AUDIT, HEADERS); return {ok:true,audit:AUDIT}; }
  function text_(v){ return String(v == null ? '' : v).trim(); }
  function title_(v){ return text_(v).toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();}); }
  function state_(v){ return text_(v).toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); }
  function zip_(v){ var m=text_(v).match(/\d{5}/); return m?m[0]:''; }
  function phone_(v){ var d=text_(v).replace(/\D/g,''); if(d.length===11&&d[0]==='1') d=d.slice(1); return d.length===10?d:''; }
  function email_(v){ var e=text_(v).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:''; }
  function parcel_(v){ return text_(v).toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function address_(v){
    var s=text_(v).replace(/\s+/g,' ').replace(/\./g,'');
    var parts=s.split(' ');
    if(parts.length){ var last=parts[parts.length-1].toLowerCase(); if(SUFFIXES[last]) parts[parts.length-1]=SUFFIXES[last]; }
    return title_(parts.join(' '));
  }
  function owner_(v){ return title_(text_(v).replace(/\s+/g,' ')); }
  function key_(r){ return [r.address,r.city,r.state,r.zip].map(function(v){return text_(v).toLowerCase().replace(/[^a-z0-9]/g,'');}).join('|'); }
  function normalize(input, options){
    input=input||{}; options=options||{};
    var warnings=[];
    var out={
      address:address_(input.address||input.Address), city:title_(input.city||input.City), state:state_(input.state||input.State), zip:zip_(input.zip||input.Zip),
      ownerName:owner_(input.ownerName||input['Owner Name']), ownerMailingAddress:address_(input.ownerMailingAddress||input['Owner Mailing Address']),
      phone:phone_(input.phone||input.Phone), email:email_(input.email||input.Email), parcelId:parcel_(input.parcelId||input['Parcel ID']||input.APN),
      distressType:text_(input.distressType||input['Distress Type']), leadSource:text_(input.leadSource||input['Lead Source']), notes:text_(input.notes||input.Notes)
    };
    out.normalizedKey=key_(out);
    if(!out.address) warnings.push('Missing address');
    if((input.phone||input.Phone)&&!out.phone) warnings.push('Invalid phone');
    if((input.email||input.Email)&&!out.email) warnings.push('Invalid email');
    if(options.audit){
      ensureSheets();
      REOS.Database.insert(AUDIT,{'Source':options.source||out.leadSource,'Source Record ID':options.sourceRecordId||'','Original JSON':JSON.stringify(input),'Normalized JSON':JSON.stringify(out),'Warnings JSON':JSON.stringify(warnings),'Created At':new Date()},{idField:'Normalization ID',idPrefix:'NORM'});
    }
    return {ok:!warnings.some(function(w){return w==='Missing address';}),record:out,warnings:warnings};
  }
  function normalizeBatch(rows, options){ rows=rows||[]; var results=rows.map(function(r,i){ return normalize(r,Object.assign({},options||{},{sourceRecordId:(options&&options.sourceRecordIdField)?r[options.sourceRecordIdField]:String(i+1)})); }); return {ok:true,total:results.length,valid:results.filter(function(x){return x.ok;}).length,invalid:results.filter(function(x){return !x.ok;}).length,results:results}; }
  return {ensureSheets:ensureSheets,normalize:normalize,normalizeBatch:normalizeBatch,normalizeAddress:address_,normalizeOwner:owner_,normalizePhone:phone_,normalizeEmail:email_,normalizeParcel:parcel_,buildKey:key_};
})();

function reosLeadNormalizationEnsureSheets(){ return REOS.LeadNormalization.ensureSheets(); }
function reosNormalizeLead(input, options){ return REOS.LeadNormalization.normalize(input, options); }
function reosNormalizeLeadBatch(rows, options){ return REOS.LeadNormalization.normalizeBatch(rows, options); }
