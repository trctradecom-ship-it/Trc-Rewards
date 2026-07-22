// ========================== VARIABLES ==========================
let provider;
let signer;
let contract;
let token;
let usdt;
let user;
let chart;
let txFinished = false;
let epochDurationFromContract = 0;
// ✅ NEW (epoch)
let epochStartFromContract = 0;


// ================= LEADERBOARD =================

let usernameContract;

let leaderboard = [];

const usernameContractAddress = "0x80eAb5bB2adDEeE5048DA653746f6f1501A5B14e";

const usernameABI = [
    "function getUsername(address) view returns(string)",
    "function hasUsername(address) view returns(bool)",
    "function setUsername(string)",
    "function editUsername(string)"
];


// ========================== CONTRACT ADDRESSES ==========================
const contractAddress = "0x90789d75566f6475b6Ea4cbcCF29C7e8F6cE399D";
const tokenAddress = "0xA355D186C6019BE07ED383309FD1d1c194Bfd06F";
const usdtAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

// ========================== ABI ==========================
const abi = [
  "function currentEpoch() view returns(uint256)",
  "function epochStart() view returns(uint256)", // ✅ ADDED
  "function getEpochDuration() view returns(uint256)",
  "function downlineCount(address) view returns(uint256)",
  "function epochTotalWeight() view returns(uint256)",
  "function pendingReward(address) view returns(uint256,uint256)",
  "function getTRCPriceUSD() view returns(uint256)",
  "function totalWeight() view returns(uint256)",
  "function rewardPoolTRC() view returns(uint256)",
  "function rewardPoolUSDT() view returns(uint256)",
  "function users(address) view returns(address,uint8,uint256,uint256,uint256,uint256,uint256)",
  "function register(address)",
  "function joinLevel1()",
  "function joinLevel2()",
  "function joinLevel3()",
  "function joinLevel4()",
  "function joinLevel5()",
  "function joinLevel6()",
  "function claimReward()",
  "function getLastEpochRewardSnapshot() view returns(uint256,uint256)",
  "event Registered(address indexed user,address indexed referrer)",
  "event LevelJoined(address indexed user,uint8 level,uint256 amount,uint256 usdtAmount)",
  "event RewardClaimed(address indexed user,uint256 trcReward,uint256 usdtReward,uint256 epoch)",
  "event EMAUpdated(uint256 price)"
];

const tokenABI = [
  "function approve(address,uint256) returns(bool)"
];

// ========================== HELPERS ==========================
function human(v){
  return Number(ethers.utils.formatUnits(v,18)).toFixed(4);
}

function usd(v){
  return Number(ethers.utils.formatUnits(v,18)).toFixed(4);
}

// ✅ NEW
function formatTime(ts){
  return new Date(ts * 1000).toLocaleString();
}

// ========================== CHART ==========================
function initChart(){
  const ctx = document.getElementById("priceChart").getContext("2d");
  chart = new Chart(ctx,{
    type:"line",
    data:{
      labels:["Start"],
      datasets:[{
        label:"TRC Price USD",
        data:[0],
        tension:0.4,
        borderColor: "blue",
        backgroundColor: "rgba(0,0,255,0.1)"
      }]
    },
    options:{ responsive:true, maintainAspectRatio:false }
  });
}

// ========================== CONNECT WALLET ==========================
async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found!");
      return;
    }

    await window.ethereum.request({ method: 'eth_requestAccounts' });

    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    user = await signer.getAddress();
    
    
    //======referral=========
    document.getElementById("refLink").value =
      window.location.href.split("?")[0] + "?ref=" + user;
    
    contract = new ethers.Contract(contractAddress, abi, signer);
    token = new ethers.Contract(tokenAddress, tokenABI, signer);
    usdt = new ethers.Contract(usdtAddress, tokenABI, signer);

    //======leaderboard=========//
    usernameContract = new ethers.Contract(
    usernameContractAddress,
    usernameABI,
    signer
    );
     
    await updateWalletDisplay(); 
      
   // Load all user data first
   await loadData();

   // Start leaderboard after the current UI has rendered
    setTimeout(() => {

        loadLeaderboard().catch(err => {

           console.error(err);

        });

    }, 0);
   
    startTimers(); // ✅ ADDED
    listenEvents();

  } catch (err) {
    console.log(err);
  }
}



async function updateWalletDisplay(){

    if(!user) return;

    if(!usernameContract){
        document.getElementById("wallet").innerText =
            user.substring(0,6) + "..." + user.substring(user.length-4);
        return;
    }

    try{

        const hasName = await usernameContract.hasUsername(user);

        if(hasName){

            const username = await usernameContract.getUsername(user);

            document.getElementById("wallet").innerHTML = "👤 " + username;

        }else{

            document.getElementById("wallet").innerHTML = "➕ Set Username";

        }

    }catch(err){

        document.getElementById("wallet").innerText =
            user.substring(0,6) + "..." + user.substring(user.length-4);

    }

}



// ========================== LOAD DASHBOARD DATA ==========================
async function loadData(){
  try{
    const price = await contract.getTRCPriceUSD();
    document.getElementById("price").innerText = "$"+usd(price);

    if(chart){
      chart.data.labels.push(new Date().toLocaleTimeString());
      chart.data.datasets[0].data.push(usd(price));
      if(chart.data.labels.length>20){
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update();
    }

    // ✅ SYSTEM DATA ONLY
   document.getElementById("epoch").innerText =
     await contract.currentEpoch();

   const rewards = await contract.pendingReward(user);

   document.getElementById("pendingTRC").innerText =
     human(rewards[0]);

   document.getElementById("pendingUSDT").innerText =
     Number(ethers.utils.formatUnits(rewards[1],6)).toFixed(4);


   const rewardPoolTRC = await contract.rewardPoolTRC();
   const rewardPoolUSDT = await contract.rewardPoolUSDT();

   document.getElementById("rewardPoolTRC").innerText =
     human(rewardPoolTRC);

   document.getElementById("rewardPoolUSDT").innerText =
     Number(ethers.utils.formatUnits(rewardPoolUSDT,6)).toFixed(4);

    

    // ✅ FETCH EPOCH START
    epochStartFromContract = Number(await contract.epochStart());

    document.getElementById("epochStart").innerText =
      formatTime(epochStartFromContract);

    epochDurationFromContract = Number(await contract.getEpochDuration());
    // ✅ NEXT EPOCH
    // ================= NEXT EPOCH (FINAL FIX) =================
    if (epochStartFromContract > 0 && epochDurationFromContract > 0) {

  const nextEpoch = epochStartFromContract + epochDurationFromContract;

  document.getElementById("nextEpoch").innerText =
    formatTime(nextEpoch);

  // ✅ Used by claimTimer (same countdown)
    } 

  }catch(e){
    console.log(e);
  }
}

// ========================== TIMER ==========================
function startTimers(){
  setInterval(()=>{

    let now = Math.floor(Date.now()/1000);

    let start = epochStartFromContract || now;
    let duration = epochDurationFromContract || 86400;

    let nextEpoch = start + duration;

    let remaining = nextEpoch - now;
    if(remaining < 0) remaining = 0;

    let d = Math.floor(remaining / 86400);
    remaining %= 86400;

    let h = Math.floor(remaining / 3600);
    remaining %= 3600;

    let m = Math.floor(remaining / 60);
    let s = remaining % 60;

    let timeText = `${d}d ${h}h ${m}m ${s}s`;

    document.getElementById("epochTimer").innerText = timeText;
    document.getElementById("claimTimer").innerText = timeText;

  },1000);
}
// ========================== HANDLE TRANSACTIONS ==========================
async function handleTx(tx){
  txFinished = false;
  try{
    // ⏳ waiting wallet confirm
    document.getElementById("status").innerHTML =
      `<span class="tx-pending">⏳ Waiting for confirmation...</span>`;

    const sent = await tx;

    // 🔄 pending with polygonscan link
    document.getElementById("status").innerHTML =
      `<a href="https://polygonscan.com/tx/${sent.hash}" target="_blank">
        🔄 Transaction Pending (View)
      </a>`;

    await sent.wait();

    document.getElementById("status").innerHTML =
      `<span class="tx-success">✅ Transaction Confirmed</span>`;

    // wait 2 seconds before allowing events
    setTimeout(()=>{
      txFinished = true;
    },2000);

  }catch(e){
    document.getElementById("status").innerHTML =
      `<span class="tx-fail">❌ Transaction Failed</span>`;
  }
}

// ========================== USER ACTIONS ==========================
async function register(){
  const ref = document.getElementById("ref").value;
  handleTx(contract.register(ref));
}

async function approveTRC(){
  const amount = document.getElementById("approveAmount").value;
  const value = ethers.utils.parseUnits(amount,18);
  handleTx(token.approve(contractAddress,value));
}

async function approveUSDT(){
  const amount = document.getElementById("approveUSDTAmount").value;

  const value = ethers.utils.parseUnits(amount,6);

  handleTx(
    usdt.approve(contractAddress, value)
  );
}

async function joinLevel(l){
  if(l==1) handleTx(contract.joinLevel1());
  if(l==2) handleTx(contract.joinLevel2());
  if(l==3) handleTx(contract.joinLevel3());
  if(l==4) handleTx(contract.joinLevel4());
  if(l==5) handleTx(contract.joinLevel5());
  if(l==6) handleTx(contract.joinLevel6());
}

async function claimReward(){
  handleTx(contract.claimReward());
}

// ========================== EVENT LISTENERS ==========================
function listenEvents() {
  if (!contract || !user) return;

  try {
    contract.on("Registered", (userAddr, referrer) => {
    if(userAddr.toLowerCase() === user.toLowerCase()){

        const showEvent = () => {
            document.getElementById("status").innerText =
              `Registered successfully with referrer: ${referrer}`;
            loadData();
        };

        if(txFinished){
            showEvent();
        }else{
            const timer = setInterval(()=>{
                if(txFinished){
                    clearInterval(timer);
                    showEvent();
                }
            },500);
        }
    }
});

   contract.on("LevelJoined",(userAddr,level,trcAmount,usdtAmount)=>{

    if(userAddr.toLowerCase() !== user.toLowerCase()) return;

    const showEvent = ()=>{
        document.getElementById("status").innerHTML =
        `✅ Joined Level ${level}<br>
         TRC: ${human(trcAmount)}<br>
         USDT: ${Number(
            ethers.utils.formatUnits(usdtAmount,6)
         ).toFixed(4)}`;

        loadData();
    };

    if(txFinished){
        showEvent();
    }else{
        const timer = setInterval(()=>{
            if(txFinished){
                clearInterval(timer);
                showEvent();
            }
        },500);
    }
});

   contract.on(
  "RewardClaimed",
  (userAddr,trcReward,usdtReward,epoch)=>{

    if(userAddr.toLowerCase() !== user.toLowerCase()) return;

    const showEvent = ()=>{
        document.getElementById("status").innerHTML =
        `✅ Reward Claimed<br>
         TRC: ${human(trcReward)}<br>
         USDT: ${Number(
            ethers.utils.formatUnits(usdtReward,6)
         ).toFixed(4)}`;

        loadData();
    };

    if(txFinished){
        showEvent();
    }else{
        const timer = setInterval(()=>{
            if(txFinished){
                clearInterval(timer);
                showEvent();
            }
        },500);
    }
});

      
    contract.on("EMAUpdated", (price) => {
      if(chart){
        chart.data.labels.push(new Date().toLocaleTimeString());
        chart.data.datasets[0].data.push(usd(price));
        if(chart.data.labels.length > 20){
          chart.data.labels.shift();
          chart.data.datasets[0].data.shift();
        }
        chart.update();
      }
    });

  } catch (err) {
    console.log(err);
  }
}

// ========================== INITIALIZE ==========================
window.onload = function(){
  initChart();

  // ✅ AUTO FILL REFERRAL
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  if(ref){
    const input = document.getElementById("ref");
    if(input){
      input.value = ref;
    }
  }
};

// ========================== REWARD CALCULATOR ==========================
function calculateReward(){

    document.getElementById("calcBaseWeight").value =
        document.getElementById("baseWeight").innerText;

    document.getElementById("calcTempWeight").value =
        document.getElementById("tempWeight").innerText;

    document.getElementById("calcTotalWeight").value =
        document.getElementById("epochWeight").innerText;

    const poolTRC = parseFloat(
        document.getElementById("lastEpochRewardTRC").innerText
    ) || 0;

    const poolUSDT = parseFloat(
        document.getElementById("lastEpochRewardUSDT").innerText
    ) || 0;

    const base =
        parseFloat(document.getElementById("calcBaseWeight").value) || 0;

    const temp =
        parseFloat(document.getElementById("calcTempWeight").value) || 0;

    const total =
        parseFloat(document.getElementById("calcTotalWeight").value) || 0;

    const userWeight = base + temp;

    if(total === 0){
        document.getElementById("rewardResult").innerHTML =
            "⚠️ No participants yet";
        return;
    }

    const trcReward = (poolTRC * userWeight) / total;
    const usdtReward = (poolUSDT * userWeight) / total;

    document.getElementById("rewardResult").innerHTML = `
        Estimated TRC Reward: ${trcReward.toFixed(4)} TRC<br>
        Estimated USDT Reward: ${usdtReward.toFixed(4)} USDT
    `;
}






// ================= TAB SWITCH =================

// ================= SYSTEM TAB =================
async function showSystem(){

  document.getElementById("systemBox").style.display = "grid";
  document.getElementById("userBox").style.display = "none";

  document.getElementById("tabSystem").classList.add("active");
  document.getElementById("tabUser").classList.remove("active");

  // ✅ LOADING STATE
  document.getElementById("price").innerText = "⏳ Loading...";
  document.getElementById("epoch").innerText = "⏳ Loading...";
  document.getElementById("pendingTRC").innerText = "⏳ Loading...";
  document.getElementById("pendingUSDT").innerText = "⏳ Loading...";

  document.getElementById("rewardPoolTRC").innerText = "⏳ Loading...";
  document.getElementById("rewardPoolUSDT").innerText = "⏳ Loading...";
  document.getElementById("epochWeight").innerText = "⏳ Loading...";
  document.getElementById("epochStart").innerText = "⏳ Loading...";
  document.getElementById("nextEpoch").innerText = "⏳ Loading...";

  // ✅ FETCH DATA
  await loadData();
}


// ================= USER TAB =================
async function showUser(){

  document.getElementById("systemBox").style.display = "none";
  document.getElementById("userBox").style.display = "grid";

  document.getElementById("tabUser").classList.add("active");
  document.getElementById("tabSystem").classList.remove("active");

  // ✅ LOADING STATE
  document.getElementById("level").innerText = "⏳ Loading...";
  document.getElementById("baseWeight").innerText = "⏳ Loading...";
  document.getElementById("tempWeight").innerText = "⏳ Loading...";
  document.getElementById("totalWeight").innerText = "⏳ Loading...";
  document.getElementById("downline").innerText = "⏳ Loading...";
  document.getElementById("referrer").innerText = "⏳ Loading...";
  document.getElementById("lastClaimEpoch").innerText = "⏳ Loading...";
  
  // ✅ FETCH DATA
  await loadUserData();
}


// ================= USER DATA =================

async function loadUserData(){
  try{
    if(!contract || !user){
      console.log("Wallet not connected");
      return;
    }

    const u = await contract.users(user);

    document.getElementById("level").innerText = u[1];
    document.getElementById("baseWeight").innerText = u[2];
    document.getElementById("tempWeight").innerText = u[3];
    document.getElementById("lastClaimEpoch").innerText = u[4];
    document.getElementById("totalWeight").innerText =
      await contract.totalWeight();

    document.getElementById("downline").innerText =
      await contract.downlineCount(user);

    const snapshot = await contract.getLastEpochRewardSnapshot();

   document.getElementById("lastEpochRewardTRC").innerText =
      human(snapshot[0]);

   document.getElementById("lastEpochRewardUSDT").innerText =
      Number(ethers.utils.formatUnits(snapshot[1],6)).toFixed(4);

    document.getElementById("epochWeight").innerText =
      await contract.epochTotalWeight();

    
    let ref = u[0];
    if(ref === "0x0000000000000000000000000000000000000000"){
      document.getElementById("referrer").innerText = "No Referrer";
    }else{
      document.getElementById("referrer").innerText =
        ref.slice(0,6) + "..." + ref.slice(-6);
    }

  }catch(e){
    console.log("User load error:", e);
  }
}


// ======copy Referral Adress======

function copyRef(){
  const link = document.getElementById("refLink").value;

  if(!link){
    alert("Connect wallet first");
    return;
  }

  navigator.clipboard.writeText(link);
  alert("✅ Link copied!");
}







// =========================================
// LOAD LAST EPOCH LEADERBOARD (FAST + CACHE)
// =========================================

async function loadLeaderboard(){

    try{

        if(!contract || !provider) return;

        const board = document.getElementById("leaderboard");

        if(!board) return;

        board.innerHTML =
        "<div class='leader-loading'>Loading Leaderboard...</div>";

        const currentEpoch = Number(
            await contract.currentEpoch()
        );

        const lastEpoch = currentEpoch - 1;

        if(lastEpoch < 1){

            renderLeaderboard([]);

            return;

        }

        // ==========================
        // SHOW CACHE INSTANTLY
        // ==========================

        const cacheKey = "leaderboard_" + lastEpoch;

        const cache = localStorage.getItem(cacheKey);

        if(cache){

            try{

                leaderboard = JSON.parse(cache);

                renderLeaderboard(leaderboard);

            }catch(e){}

        }

        // ==========================
        // READ EVENTS
        // ==========================
          // ==========================
// READ EVENTS (DEBUG)
// ==========================

const DEPLOY_BLOCK = 89400917;

const latestBlock = await provider.getBlockNumber();

const epochSeconds = Number(await contract.getEpochDuration());

const avgBlockTime = 1.6;

const blocksPerEpoch = Math.ceil(epochSeconds / avgBlockTime);

const safetyBlocks = 20000;

console.log("Latest Block:", latestBlock);
console.log("Epoch Seconds:", epochSeconds);
console.log("Blocks Per Epoch:", blocksPerEpoch);

const fromBlock = Math.max(
    DEPLOY_BLOCK,
    latestBlock - blocksPerEpoch - safetyBlocks
);

console.log("From Block:", fromBlock);

const filter = contract.filters.RewardClaimed();

const events = [];

const CHUNK = 10000;

for (let start = fromBlock; start <= latestBlock; start += CHUNK) {

    const end = Math.min(start + CHUNK - 1, latestBlock);

    try {

        const logs = await contract.queryFilter(
            filter,
            start,
            end
        );

        events.push(...logs);

    } catch (err) {

        console.log("Chunk failed:", start);

    }

}

console.log("Events:", events.length);
        
        // ==========================
        // BUILD USERS
        // ==========================

        const users = {};

        for(const e of events){

            if(Number(e.args.epoch)!==lastEpoch)
                continue;

            const wallet = e.args.user;

            if(!users[wallet]){

                users[wallet]={

                    wallet,

                    username:"",

                    trc:0,

                    usdt:0

                };

            }

            users[wallet].trc += Number(

                ethers.utils.formatUnits(

                    e.args.trcReward,

                    18

                )

            );

            users[wallet].usdt += Number(

                ethers.utils.formatUnits(

                    e.args.usdtReward,

                    6

                )

            );

        }

        // ==========================
        // LOAD USERNAMES
        // ==========================

        const wallets =

        Object.keys(users);

        await Promise.all(

            wallets.map(

                async(wallet)=>{

                    try{

                        let username =

                        await usernameContract.getUsername(

                            wallet

                        );

                        if(

                            !username ||

                            username.trim()===""

                        ){

                            username =

                            wallet.substring(0,6)

                            +"..."+

                            wallet.substring(

                                wallet.length-4

                            );

                        }

                        users[wallet].username =

                        username;

                    }

                    catch{

                        users[wallet].username =

                        wallet.substring(0,6)

                        +"..."+

                        wallet.substring(

                            wallet.length-4

                        );

                    }

                }

            )

        );

        // ==========================
        // SORT
        // ==========================

       // ==========================
// BUILD LEADERBOARD
// ==========================

leaderboard = Object.values(users).filter(u =>
    u.trc > 0 || u.usdt > 0
);

leaderboard.sort(

    (a,b)=>{

        if(b.trc !== a.trc)

            return b.trc - a.trc;

        return b.usdt - a.usdt;

    }

);
        // ==========================
        // SAVE CACHE
        // ==========================

        localStorage.setItem(

            cacheKey,

            JSON.stringify(

                leaderboard

            )

        );

        renderLeaderboard(

            leaderboard

        );

    }

    catch(err){

        console.error(

            "Leaderboard:",

            err

        );

        document.getElementById(

            "leaderboard"

        ).innerHTML =

        "<div class='leader-loading'>Failed to load leaderboard</div>";

    }











    // =========================================
// RENDER LEADERBOARD
// =========================================

function renderLeaderboard(data){

    const box = document.getElementById("leaderboard");

    if(!box) return;

    if(!data || data.length===0){

        box.innerHTML=`
        <div class="leader-empty">
            No rewards claimed in last epoch.
        </div>`;

        return;

    }

    let html="";

    const total=Math.min(data.length,20);

    for(let i=0;i<total;i++){

        const u=data[i];

        let medal="";
        let cls="leader-item";

        if(i===0){

            medal="🥇";
            cls+=" gold";

        }
        else if(i===1){

            medal="🥈";
            cls+=" silver";

        }
        else if(i===2){

            medal="🥉";
            cls+=" bronze";

        }

        const walletShort=
        u.wallet.substring(0,8)+
        "..."+
        u.wallet.substring(u.wallet.length-4);

        html+=`

        <div class="${cls}">

            <div class="leader-rank">

                ${medal || (i+1)}

            </div>

            <div class="leader-center">

                <div class="leader-name">

                    ${u.username}

                </div>

                <div class="leader-wallet">

                    ${walletShort}

                </div>

            </div>

            <div class="leader-right">

                <div class="leader-usdt">
    
                ${Number(u.usdt).toFixed(4)} USDT
                
                </div>

                <div class="leader-trc">
                
                     ${Number(u.trc).toFixed(4)} TRC
                    
                </div>

            </div>

        </div>

        `;

    }

    box.innerHTML=html;

}
}





async function setOrEditUsername(){

    if(!user){

        alert("Connect wallet first");

        return;

    }

    try{

        const hasName = await usernameContract.hasUsername(user);

        let oldName = "";

        if(hasName){

            oldName = await usernameContract.getUsername(user);

        }

        const username = prompt(
            hasName ? "Edit Username" : "Set Username",
            oldName
        );

        if(username === null) return;

        if(username.trim() === ""){

            alert("Username cannot be empty");

            return;

        }

        let tx;

        if(hasName){

            tx = await usernameContract.editUsername(username.trim());

        }else{

            tx = await usernameContract.setUsername(username.trim());

        }

        document.getElementById("status").innerHTML =
            "⏳ Waiting for confirmation...";

        await tx.wait();

        document.getElementById("status").innerHTML =
            "✅ Username Updated";

        await updateWalletDisplay();

    }catch(err){

        console.log(err);

        document.getElementById("status").innerHTML =
            "❌ Username Update Failed";

    }

}
