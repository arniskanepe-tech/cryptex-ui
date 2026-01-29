(function(){
class Cryptex{
  constructor(root,opts){
    this.root=root;
    this.opts=Object.assign({
      ringsCount:6,
      alphabet:"ABCDEF",
      solution:""
    },opts);
    this.state={
      indices:Array(this.opts.ringsCount).fill(0),
      progress:0
    };
    this.build();
    this.bind();
    this.renderAll();
    this.updateLocks();
  }

  build(){
    this.root.className="cryptex";
    this.root.innerHTML=`
      <div class="cryptex-shell">
        <div class="cryptex-cap"></div>
        <div class="cryptex-body">
          ${Array.from({length:this.opts.ringsCount}).map((_,i)=>this.ringHtml(i)).join("")}
        </div>
        <div class="cryptex-cap"></div>
      </div>`;
    this.rings=[...this.root.querySelectorAll(".cryptex-ring")];
  }

  ringHtml(i){
    const chars=this.opts.alphabet.split("");
    const step=360/chars.length;
    return `
      <div class="cryptex-ring" data-i="${i}">
        <div class="cryptex-window"></div>
        <div class="cryptex-cylinder">
          ${chars.map((c,j)=>`
            <div class="cryptex-face" style="--ry:${j*step}deg">
              <span>${c}</span>
            </div>`).join("")}
        </div>
      </div>`;
  }

  bind(){
    this.rings.forEach((r,i)=>{
      r.addEventListener("wheel",e=>{
        if(i>=this.state.progress) return;
        e.preventDefault();
        this.rotate(i,e.deltaY>0?1:-1);
      },{passive:false});
    });
  }

  rotate(i,dir){
    const n=this.opts.alphabet.length;
    this.state.indices[i]=(this.state.indices[i]+dir+n)%n;
    this.renderRing(i);
  }

  renderAll(){ this.rings.forEach((_,i)=>this.renderRing(i)); }

  renderRing(i){
    const ring=this.rings[i];
    const idx=this.state.indices[i];
    ring.querySelector(".cryptex-cylinder")
      .style.transform=`rotateY(${-idx*(360/this.opts.alphabet.length)}deg)`;
  }

  updateLocks(){
    this.rings.forEach((r,i)=>{
      r.classList.toggle("locked",i>=this.state.progress);
    });
  }

  unlockNextRing(){
    if(this.state.progress<this.opts.ringsCount){
      this.state.progress++;
      this.updateLocks();
    }
  }

  setProgress(n){
    this.state.progress=n;
    this.updateLocks();
  }
}
window.Cryptex=Cryptex;
})();
