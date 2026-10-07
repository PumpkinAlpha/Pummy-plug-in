import React from 'react';
import {call,latest} from './bridge.js';
export class RecoveryBoundary extends React.Component{
 state={failed:false,busy:false,error:''};
 static getDerivedStateFromError(){return {failed:true};}
 retry=async()=>{
  this.setState({busy:true,error:''});
  try{await call('read_course_state',latest.state?{courseId:latest.state.courseId}:{});this.setState({failed:false});}
  catch(e){this.setState({error:e.message});}
  finally{this.setState({busy:false});}
 };
 render(){return this.state.failed?<main className="workspace"><section className="layout"><div role="alert"><h1>Pummy could not display this view.</h1><p>Your saved exam has not been changed.</p><p>{this.state.error||'Reload your test, or close and reopen the panel.'}</p><button className="primary" disabled={this.state.busy} onClick={this.retry}>{this.state.busy?'Loading…':'Reload saved test'}</button></div></section></main>:this.props.children;}
}
