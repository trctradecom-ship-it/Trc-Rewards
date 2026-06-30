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


// ========================== CONTRACT ADDRESSES ==========================
const contractAddress = "0x5EFcFE137589990aDD827E1F47cE9900a584Cd7C";
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
    
    document.getElementById("wallet").innerText = user;
    
    //======referral=========
    document.getElementById("refLink").value =
      window.location.href.split("?")[0] + "?ref=" + user;
    
    contract = new ethers.Contract(contractAddress, abi, signer);
    token = new ethers.Contract(tokenAddress, tokenABI, signer);
    usdt = new ethers.Contract(usdtAddress, tokenABI, signer);

    loadData();
    
   
    startTimers(); // ✅ ADDED
    listenEvents();

  } catch (err) {
    console.log(err);
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
            },200);
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
        },200);
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
        },200);
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
