import {expect,it} from 'vitest'
import {continuityMeasurementRequired,evaluateContinuity,expectedContinuityIds,type ContinuityScope} from './continuity'
const row=(id:string)=>({id,from:'TB1-'+id,to:'TB2-'+id,result:'pass',remarks:'',reading:null as number|null,unit:''})
const base=()=>({version:1,grouping:'pairs',count:1,shields:['general'],measurementRequired:false,rows:['P1-A','P1-B','S:general'].map(row)})
const scope:ContinuityScope={grouping:'pairs',count:1,shields:['general']}
const ev=(v:string,s:ContinuityScope|null=scope,m=false)=>evaluateContinuity(v,s,m)
it('requires both conductors in a pair and each declared shield',()=>{
 const data=base();expect(ev(JSON.stringify(data)).isComplete).toBe(true)
 data.rows.pop();expect(ev(JSON.stringify(data)).isComplete).toBe(false)
 expect(expectedContinuityIds('conductors',2,[])).toEqual(['C1','C2'])
})
it('rejects duplicate and foreign rows',()=>{const d=base();d.rows[1]=row('P1-A');expect(ev(JSON.stringify(d)).isComplete).toBe(false)})
it('requires units and finite readings only when the template requires measurement',()=>{
 const d=base();expect(ev(JSON.stringify(d),scope,true).isComplete).toBe(false)
 // A38 (38-3): lo que el ejecutor marque en la captura no decide.
 d.measurementRequired=true;expect(ev(JSON.stringify(d),scope,false).isComplete).toBe(true)
})
it('requires NA justification and separates rejection from capture',()=>{const d=base();d.rows[0].result='not_applicable';expect(ev(JSON.stringify(d)).isComplete).toBe(false);d.rows[0].remarks='Según procedimiento';d.rows[1].result='fail';const r=ev(JSON.stringify(d));expect(r.isComplete).toBe(true);expect(r.hasFail).toBe(true)})
it('fails closed for malformed JSON and invalid cardinality',()=>{for(const v of ['{}','bad','null',JSON.stringify({...base(),count:1.5}),JSON.stringify({...base(),count:501}),JSON.stringify({...base(),shields:['general','general']})])expect(ev(v).isComplete).toBe(false)})

it('matches database finite numbers including zero and underflow', () => {
 const d = {...base(), rows:base().rows.map(r=>({...r,reading:0,unit:'ohm'}))}
 const valid = JSON.stringify(d)
 expect(ev(valid,scope,true).isComplete).toBe(true)
 expect(ev(valid.replaceAll('"reading":0','"reading":1e-400'),scope,true).isComplete).toBe(true)
 expect(ev(valid.replaceAll('"reading":0','"reading":1e400'),scope,true).isComplete).toBe(false)
 expect(ev(valid.replaceAll('"reading":0','"reading":"0"'),scope,true).isComplete).toBe(false)
})
it('rejects characters unsupported by jsonb while allowing valid Unicode pairs', () => {
 for (const terminal of ['\u0000', '\ud800', '\udfff']) {
  const d=base();d.rows[0].from=terminal
  expect(ev(JSON.stringify(d)).isComplete).toBe(false)
 }
 const d=base();d.rows[0].from='TB-😀'
 expect(ev(JSON.stringify(d)).isComplete).toBe(true)
})

it('does not accept Unicode whitespace as a terminal', () => { const d=base();d.rows[0].from=' ﻿';expect(ev(JSON.stringify(d)).isComplete).toBe(false) })

it('A38: without a scope set by a leader the continuity is not complete, but a rejection still counts', () => {
 const d=base();d.rows[0].result='fail'
 const r=ev(JSON.stringify(d),null)
 expect(r).toMatchObject({isComplete:false,hasFail:true,scopeMissing:true,scopeMismatch:false})
})
it('A38: a capture that does not cover the scope exactly is not complete', () => {
 const d=base()
 expect(ev(JSON.stringify(d),{grouping:'pairs',count:4,shields:['general']})).toMatchObject({isComplete:false,scopeMismatch:true})
 expect(ev(JSON.stringify(d),{grouping:'conductors',count:1,shields:['general']}).scopeMismatch).toBe(true)
 expect(ev(JSON.stringify(d),{grouping:'pairs',count:1,shields:[]}).scopeMismatch).toBe(true)
 // las pantallas son un conjunto: el orden no importa
 const two={...base(),shields:['b','a'],rows:['P1-A','P1-B','S:b','S:a'].map(row)}
 expect(ev(JSON.stringify(two),{grouping:'pairs',count:1,shields:['a','b']}).isComplete).toBe(true)
})
it('A38: the template option decides whether readings are required', () => {
 expect(continuityMeasurementRequired({measurement_required:true})).toBe(true)
 for (const o of [null,{},{measurement_required:'true'},['measurement_required'],{measurement_required:false}]) expect(continuityMeasurementRequired(o)).toBe(false)
})
