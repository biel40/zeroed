import * as THREE from 'three';
import { it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildPPSH41 } from '../src/weapons/PPSH41ViewModel';
import { HAND_POSES, FINGER_LAYOUT, PHALANX_TAPER, type HandPose, type FingerName } from '../src/weapons/HandPoses';
import { FirstPersonArm } from '../src/weapons/FirstPersonArm';
import { WeaponHands } from '../src/weapons/WeaponHands';
import { THUMB, THUMB_LENGTHS } from '../src/weapons/ArmRig';

it('authors PPSh stock grip against wood geometry',()=>{
  const definition=WEAPON_DEFINITIONS.ppsh41;
  const built=buildPPSH41(definition.view);
  const stock=built.group.getObjectByName('ppsh41-stock')!;
  built.group.updateMatrixWorld(true);
  const triangles: THREE.Triangle[]=[];
  stock.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshPhysicalMaterial))return;
    const p=object.geometry.attributes.position;
    for(let i=0;i<p.count;i+=3){
      const tri=new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(object.matrixWorld)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]);
      if(Math.min(tri.a.z,tri.b.z,tri.c.z)<.23 && Math.max(tri.a.z,tri.b.z,tri.c.z)>.04)triangles.push(tri);
    }
  });
  const closest=new THREE.Vector3(),normal=new THREE.Vector3();
  const signed=(point:THREE.Vector3):number=>{
    let dist=Infinity,sign=1;
    for(const tri of triangles){
      tri.closestPointToPoint(point,closest);
      const d=closest.distanceToSquared(point);
      if(d<dist){dist=d;sign=point.clone().sub(closest).dot(tri.getNormal(normal))>=0?1:-1;}
    }
    return Math.sqrt(dist)*sign;
  };
  const root=new THREE.Group();
  const config=structuredClone(definition.view.hands);
  const driver=new WeaponHands(config,root,{magazine:null,handle:null},null,false,definition.view.sightHeight);
  const pos=new THREE.Vector3(),rotation=new THREE.Quaternion();
  let pose=structuredClone(driver.read('right',pos,rotation)!);
  const arm=new FirstPersonArm('right');
  const refresh=()=>{arm.setHandPose(pose,1);arm.reachGrip(pos,rotation,new THREE.Vector3(.42,-.3,.3));};
  const point=(bone:number,t:number)=>arm.mesh.skeleton.bones[bone].localToWorld(new THREE.Vector3(0,0,-t));
  const names:FingerName[]=[];
  const targets=[new THREE.Vector3(-.023,-.048,.115),new THREE.Vector3(-.023,-.05,.14),new THREE.Vector3(-.023,-.055,.16)];
  const fingerCost=(name:FingerName,which:number)=>{
    refresh();
    const finger=which+1;
    const spec=FINGER_LAYOUT[name];
    const curl=pose[name].curl;
    let cost=.002*Math.abs(curl[2]-.7*curl[1])+.002*Math.max(0,2-curl.reduce((a,b)=>a+b,0));
    let contact=Infinity;
    for(let segment=0;segment<3;segment++)for(const t of [.4,.7,.95]){
      const p=point(3+finger*3+segment,spec.lengths[segment]*t);
      const gap=signed(p)-spec.radius*PHALANX_TAPER**segment;
      cost+=Math.max(0,-.003-gap)*20;
      contact=Math.min(contact,Math.abs(gap));
    }
    cost+=contact*2;
    cost+=point(3+finger*3+2,spec.lengths[2]*.6).distanceTo(targets[which])*.5;
    return cost;
  };
  const random=(seed:number)=>{let s=seed;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;}};
  const rand=random(41);
  for(const [which,name] of names.entries()){
    let best=Infinity,bestValues:number[]=[];
    for(let trial=0;trial<350;trial++){
      const values=[.5+rand()*1.1,.4+rand()*1.3,.2+rand()*1.0,-.7+rand()*1.8];
      pose={...pose,[name]:{curl:values.slice(0,3),spread:values[3]}} as HandPose;
      const cost=fingerCost(name,which);
      if(cost<best){best=cost;bestValues=values;}
    }
    for(const step of [.12,.04,.012])for(let pass=0;pass<6;pass++)for(let i=0;i<4;i++)for(const direction of [-1,1]){
      const trial=[...bestValues];trial[i]+=direction*step;
      if(trial[i] < (i===3?-.9:0) || trial[i]>(i===3?1.2:i===0?1.7:i===1?1.85:1.3))continue;
      pose={...pose,[name]:{curl:trial.slice(0,3),spread:trial[3]}} as HandPose;
      const cost=fingerCost(name,which);if(cost<best){best=cost;bestValues=trial;}
    }
    pose={...pose,[name]:{curl:bestValues.slice(0,3),spread:bestValues[3]}} as HandPose;
    console.log(name,best,pose[name]);
  }
  const thumbCost=()=>{
    refresh();let cost=0,contact=Infinity;
    for(let segment=0;segment<3;segment++)for(const t of [.4,.7,.95]){
      const p=point(THUMB+segment,THUMB_LENGTHS[segment]*t);
      const gap=signed(p)-(.010-segment*.001);
      cost+=Math.max(0,-.003-gap)*20;
      if(segment>0)contact=Math.min(contact,Math.abs(gap));
      if(p.y>-.023 && p.z<.13)cost+=(p.y+.023)*20;
    }
    cost+=contact*2+point(THUMB+2,THUMB_LENGTHS[2]*.6).distanceTo(new THREE.Vector3(-.024,-.043,.15));
    return cost;
  };
  let thumbBest=Infinity,thumbValues:number[]=[];
  for(let trial=0;trial<700;trial++){
    const vals=[-.5+rand()*2, .2+rand()*1.5,1.6+rand()*2.3,rand()*1.1,rand()*1.1];
    pose={...pose,thumb:{base:vals.slice(0,3),curl:vals.slice(3)}} as HandPose;
    const cost=thumbCost();if(cost<thumbBest){thumbBest=cost;thumbValues=vals;}
  }
  for(const step of [.12,.04,.012])for(let pass=0;pass<7;pass++)for(let i=0;i<5;i++)for(const direction of [-1,1]){
    const vals=[...thumbValues];vals[i]+=direction*step;
    if(i>2&&(vals[i]<0||vals[i]>1.5))continue;
    pose={...pose,thumb:{base:vals.slice(0,3),curl:vals.slice(3)}} as HandPose;
    const cost=thumbCost();if(cost<thumbBest){thumbBest=cost;thumbValues=vals;}
  }
  pose={...pose,thumb:{base:thumbValues.slice(0,3),curl:thumbValues.slice(3)}} as HandPose;
  console.log('thumb',thumbBest,pose.thumb);console.log('pose',JSON.stringify(pose));
  refresh();
  const geometry=arm.mesh.geometry;
  const indices=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  for(const [name,bone] of [['middle',8],['ring',11],['pinky',14],['thumb',17]] as const){
    let nearest=Infinity,deepest=Infinity,count=0;const nearestPoint=new THREE.Vector3();
    for(let i=0;i<geometry.attributes.position.count;i++){
      let weight=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===bone)weight+=weights.getComponent(i,j);
      if(weight<.7)continue;
      const p=arm.mesh.localToWorld(arm.mesh.getVertexPosition(i,new THREE.Vector3()));
      const gap=signed(p);count++;deepest=Math.min(deepest,gap);
      if(Math.abs(gap)<nearest){nearest=Math.abs(gap);nearestPoint.copy(p);}
    }
    console.log('skincontact',name,{nearest,deepest,count,nearestPoint:nearestPoint.toArray()});
  }
});
