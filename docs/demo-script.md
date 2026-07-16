# Autarca — Demo Video Script (aim for 3-5 minutes)

1. **Hook (15s):** "RWA collateral in DeFi goes stale between valuations —
   Autarca fixes this with a fully autonomous agent pipeline on Casper."
2. **Problem (30s):** Explain stale valuations / manual liquidation risk.
3. **Architecture walkthrough (60s):** Show the diagram — Valuation Agent
   (x402) → Chain-State Agent (MCP) → Decision Agent (LLM) → Execution
   Agent (CSPR.click) → Odra smart contract on Casper Testnet.
4. **Live demo (90s):**
   - Open a position on Testnet (show `open_position` tx).
   - Start the agent (`npm run dev` in `agent/`), show console + dashboard
     activity feed streaming live.
   - Show a valuation update or liquidation transaction landing on-chain
     (link it on a Testnet explorer / CSPR.cloud).
5. **Why it matters / roadmap (30s):** RWA growth on Casper, multi-asset
   support, DAO governance, mainnet plan.
6. **Close (15s):** Repo link, team, call to action.
