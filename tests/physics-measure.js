const { Sim, Runner, L, R, J, C } = require('./lib');
// Misst Sprunghöhe/-weite in der echten Simulation auf Level 0, flacher Boden
function measure(){
  const r=new Runner(0); r.s.p[0].x=100; r.s.p[1].x=2000;
  for(let i=0;i<30;i++) r.tick(0,0);
  const y0=r.s.p[0].y; let minY=y0;
  r.tick(J,0); for(let i=0;i<80;i++){ r.tick(J,0); minY=Math.min(minY,r.s.p[0].y); if(r.s.p[0].g!==-1)break;}
  const h=y0-minY;
  const a=new Runner(1); // Level 1: flach bis x=350
  a.s.p[0].x=20; for(let i=0;i<30;i++)a.tick(0,0);
  for(let i=0;i<30;i++)a.tick(R,0);
  // voller Lauf, Absprung
  const x0=a.s.p[0].x; const y=a.s.p[0].y; let t=0; a.s.solids;
  a.tick(R|J,0); t++; while(a.s.p[0].y<y-0.01||t<5){a.tick(R|J,0);t++; if(t>100)break;}
  // kurzer Hopser
  const b=new Runner(0); b.s.p[0].x=100; for(let i=0;i<30;i++) b.tick(0,0);
  let m2=b.s.p[0].y; const yb=m2; for(let i=0;i<5;i++)b.tick(J,0); for(let i=0;i<60;i++){b.tick(0,0);m2=Math.min(m2,b.s.p[0].y);}
  console.log({jumpHeight:h, shortHop:yb-m2, flatRange:a.s.p[0].x-x0, airTicks:t, footGap:(a.s.p[0].x-x0)+C.PW, withCoyote:(a.s.p[0].x-x0)+C.PW+C.COYOTE*C.RUN});
}
measure();
