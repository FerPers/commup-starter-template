import {expect,it} from 'vitest'
import {evaluateContinuity,expectedContinuityIds} from './continuity'
const row=(id:string)=>({id,from:'TB1-'+id,to:'TB2-'+id,result:'pass',remarks:'',reading:null,unit:''})
const base=()=>({version:1,grouping:'pairs',count:1,shields:['general'],measurementRequired:false,rows:['P1-A','P1-B','S:general'].map(row)})
it('requires both conductors in a pair and each declared shield',()=>{
 const data=base();expect(evaluateContinuity(JSON.stringify(data)).isComplete).toBe(true)
 data.rows.pop();expect(evaluateContinuity(JSON.stringify(data)).isComplete).toBe(false)
 expect(expectedContinuityIds('conductors',2,[])).toEqual(['C1','C2'])
})
it('rejects duplicate and foreign rows',()=>{const d=base();d.rows[1]=row('P1-A');expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(false)})
it('requires units and finite readings only when measurement is required',()=>{const d=base();d.measurementRequired=true;expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(false)})
it('requires NA justification and separates rejection from capture',()=>{const d=base();d.rows[0].result='not_applicable';expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(false);d.rows[0].remarks='Según procedimiento';d.rows[1].result='fail';const r=evaluateContinuity(JSON.stringify(d));expect(r.isComplete).toBe(true);expect(r.hasFail).toBe(true)})
it('fails closed for malformed JSON and invalid cardinality',()=>{for(const v of ['{}','bad','null',JSON.stringify({...base(),count:1.5}),JSON.stringify({...base(),count:501}),JSON.stringify({...base(),shields:['general','general']})])expect(evaluateContinuity(v).isComplete).toBe(false)})

it('matches database finite numbers including zero and underflow', () => {
 const d = {...base(), measurementRequired:true, rows:base().rows.map(r=>({...r,reading:0,unit:'ohm'}))}
 const valid = JSON.stringify(d)
 expect(evaluateContinuity(valid).isComplete).toBe(true)
 expect(evaluateContinuity(valid.replaceAll('"reading":0','"reading":1e-400')).isComplete).toBe(true)
 expect(evaluateContinuity(valid.replaceAll('"reading":0','"reading":1e400')).isComplete).toBe(false)
 expect(evaluateContinuity(valid.replaceAll('"reading":0','"reading":"0"')).isComplete).toBe(false)
})
it('rejects characters unsupported by jsonb while allowing valid Unicode pairs', () => {
 for (const terminal of ['\u0000', '\ud800', '\udfff']) {
  const d=base();d.rows[0].from=terminal
  expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(false)
 }
 const d=base();d.rows[0].from='TB-😀'
 expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(true)
})

it('does not accept Unicode whitespace as a terminal', () => { const d=base();d.rows[0].from='\u00a0\ufeff';expect(evaluateContinuity(JSON.stringify(d)).isComplete).toBe(false) })
