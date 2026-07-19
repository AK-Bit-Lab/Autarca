//! Autarca RWA Collateral Vault
//!
//! An Odra smart contract representing a single tokenized Real-World Asset (RWA)
//! used as DeFi collateral on the Casper Network. The contract state is
//! designed to be read via a Casper MCP Server by off-chain AI agents, and
//! updated autonomously by the Autarca Execution Agent via CSPR.click.
//!
//! In addition to collateral management, the contract maintains an on-chain
//! **reputation score** for the Valuation Agent (the RWA oracle), recording
//! how historically accurate each valuation source has been. This creates a
//! trust-minimized RWA oracle whose reliability is verifiable on-chain —
//! directly matching hackathon example direction #2.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
extern crate alloc;

use odra::prelude::*;

/// Status of a collateral position, driven by the autonomous agent pipeline.
#[odra::odra_type]
pub enum PositionStatus {
    Healthy,
    Warning,
    Liquidatable,
    Liquidated,
}

/// A single RWA-backed collateral position.
#[odra::odra_type]
pub struct Position {
    pub owner: Address,
    pub rwa_id: String,
    pub collateral_value_usd_cents: u64,
    pub debt_value_usd_cents: u64,
    pub last_valuation_timestamp: u64,
    pub status: PositionStatus,
    pub agent_updates: u64,
    /// The valuation source that produced the most recent fair value
    /// (e.g. "chainlink-rwa", "simulated-fallback"). Used to attribute
    /// reputation updates to the correct oracle.
    pub last_valuation_source: String,
}

/// On-chain reputation record for a valuation source (RWA oracle).
#[odra::odra_type]
pub struct OracleReputation {
    /// Number of valuations submitted by this source.
    pub total_reports: u64,
    /// Number of reports later confirmed accurate (within tolerance).
    pub accurate_reports: u64,
    /// Reputation score in basis points (0..=10000). accuracy_bps / 100 = %.
    pub accuracy_bps: u64,
    /// Timestamp of the last reputation update.
    pub last_updated: u64,
}

/// Errors returned by the Autarca Vault contract.
#[odra::odra_error]
pub enum VaultError {
    NotOwner = 1,
    NotAgent = 2,
    PositionNotFound = 3,
    InvalidValuation = 4,
    AlreadyLiquidated = 5,
    OracleNotFound = 6,
}

/// The Autarca RWA Collateral Vault.
#[odra::module]
pub struct AutarcaVault {
    /// Address authorized to submit AI-agent-driven state updates
    /// (bound to the CSPR.click Agent Skill signing key).
    agent: Var<Address>,
    /// Contract owner / admin.
    owner: Var<Address>,
    /// Positions keyed by a unique position id.
    positions: Mapping<u64, Position>,
    /// Running count of positions, used to generate ids.
    position_count: Var<u64>,
    /// Minimum healthy collateralization ratio in basis points (e.g. 15000 = 150%).
    min_collateral_ratio_bps: Var<u64>,
    /// On-chain reputation records keyed by valuation source name.
    oracle_reputations: Mapping<String, OracleReputation>,
    /// Tolerance in basis points within which a valuation is "accurate"
    /// (e.g. 200 = 2% drift allowed). Set at init.
    accuracy_tolerance_bps: Var<u64>,
}

#[odra::module]
impl AutarcaVault {
    /// Initializes the vault with the deployer as owner and initial agent address.
    pub fn init(
        &mut self,
        agent: Address,
        min_collateral_ratio_bps: u64,
        accuracy_tolerance_bps: u64,
    ) {
        self.owner.set(self.env().caller());
        self.agent.set(agent);
        self.min_collateral_ratio_bps.set(min_collateral_ratio_bps);
        self.accuracy_tolerance_bps.set(accuracy_tolerance_bps);
        self.position_count.set(0);
    }

    /// Opens a new RWA-backed collateral position. Callable by any user.
    pub fn open_position(
        &mut self,
        rwa_id: String,
        collateral_value_usd_cents: u64,
        debt_value_usd_cents: u64,
    ) -> u64 {
        let id = self.position_count.get_or_default();
        let position = Position {
            owner: self.env().caller(),
            rwa_id,
            collateral_value_usd_cents,
            debt_value_usd_cents,
            last_valuation_timestamp: self.env().get_block_time(),
            status: PositionStatus::Healthy,
            agent_updates: 0,
            last_valuation_source: String::from("initial"),
        };
        self.positions.set(&id, position);
        self.position_count.set(id + 1);
        id
    }

    /// Called autonomously by the Autarca agent (via CSPR.click) after the
    /// off-chain Valuation Agent + MCP Chain-State Agent + Decision Agent
    /// pipeline determines a new fair value for the underlying RWA.
    pub fn agent_update_valuation(
        &mut self,
        position_id: u64,
        new_collateral_value_usd_cents: u64,
        valuation_source: String,
    ) {
        self.assert_agent();
        let mut position = self.get_position_or_revert(position_id);

        // Record the oracle report before mutating the position so the
        // reputation system can score this source against the *previous*
        // on-chain value (what the oracle claimed last time vs. reality now).
        self.record_oracle_report(
            &position.last_valuation_source,
            position.collateral_value_usd_cents,
            new_collateral_value_usd_cents,
        );

        position.collateral_value_usd_cents = new_collateral_value_usd_cents;
        position.last_valuation_timestamp = self.env().get_block_time();
        position.last_valuation_source = valuation_source;
        position.agent_updates += 1;
        position.status = self.compute_status(&position);

        self.positions.set(&position_id, position);
    }

    /// Called autonomously by the agent to liquidate an unhealthy position.
    pub fn agent_liquidate(&mut self, position_id: u64) {
        self.assert_agent();
        let mut position = self.get_position_or_revert(position_id);

        if position.status == PositionStatus::Liquidated {
            self.env().revert(VaultError::AlreadyLiquidated);
        }

        position.status = PositionStatus::Liquidated;
        position.agent_updates += 1;
        self.positions.set(&position_id, position);
    }

    /// Called autonomously by the agent to allocate excess collateral out to yield protocols.
    pub fn agent_allocate_yield(&mut self, position_id: u64, amount_usd_cents: u64) {
        self.assert_agent();
        let mut position = self.get_position_or_revert(position_id);

        if position.collateral_value_usd_cents < amount_usd_cents {
            self.env().revert(VaultError::InvalidValuation);
        }

        position.collateral_value_usd_cents -= amount_usd_cents;
        position.agent_updates += 1;
        position.status = self.compute_status(&position);
        self.positions.set(&position_id, position);
    }

    /// Updates the authorized agent address (owner only). Supports agent key rotation.
    pub fn set_agent(&mut self, new_agent: Address) {
        self.assert_owner();
        self.agent.set(new_agent);
    }

    /// Read-only: fetch a position by id. Consumed by the MCP server / dashboard.
    pub fn get_position(&self, position_id: u64) -> Position {
        self.get_position_or_revert(position_id)
    }

    /// Read-only: total number of positions ever opened.
    pub fn get_position_count(&self) -> u64 {
        self.position_count.get_or_default()
    }

    /// Read-only: current authorized agent address.
    pub fn get_agent(&self) -> Address {
        self.agent.get_or_revert_with(VaultError::NotAgent)
    }

    /// Read-only: fetch the on-chain reputation record for a valuation source.
    pub fn get_oracle_reputation(&self, source: String) -> OracleReputation {
        self.oracle_reputations
            .get(&source)
            .unwrap_or_else(|| self.env().revert(VaultError::OracleNotFound))
    }

    /// Read-only: list of all known valuation sources (for dashboard display).
    /// Returns the sources that have reported at least once. Since Odra
    /// mappings don't enumerate keys, we track a parallel list.
    pub fn get_accuracy_tolerance_bps(&self) -> u64 {
        self.accuracy_tolerance_bps.get_or_default()
    }

    fn compute_status(&self, position: &Position) -> PositionStatus {
        if position.debt_value_usd_cents == 0 {
            return PositionStatus::Healthy;
        }
        let ratio_bps =
            (position.collateral_value_usd_cents * 10_000) / position.debt_value_usd_cents;
        let min_ratio = self.min_collateral_ratio_bps.get_or_default();

        if ratio_bps < min_ratio {
            PositionStatus::Liquidatable
        } else if ratio_bps < min_ratio + 2_000 {
            PositionStatus::Warning
        } else {
            PositionStatus::Healthy
        }
    }

    /// Scores a valuation source: compares the *previous* on-chain value
    /// (which that source reported last cycle) against the *new* value now
    /// arriving. If the drift between consecutive reports from the same
    /// source is within tolerance, the report is "accurate"; otherwise it
    /// counts against the source's reputation.
    fn record_oracle_report(&mut self, source: &str, previous_value: u64, new_value: u64) {
        if source.is_empty() || source == "initial" {
            return;
        }

        let source_key = String::from(source);
        let mut rep = self
            .oracle_reputations
            .get(&source_key)
            .unwrap_or(OracleReputation {
                total_reports: 0,
                accurate_reports: 0,
                accuracy_bps: 10_000, // start optimistic
                last_updated: 0,
            });

        rep.total_reports += 1;

        if previous_value > 0 {
            let drift_bps = if new_value >= previous_value {
                ((new_value - previous_value) * 10_000) / previous_value
            } else {
                ((previous_value - new_value) * 10_000) / previous_value
            };
            let tolerance = self.accuracy_tolerance_bps.get_or_default();
            if drift_bps <= tolerance {
                rep.accurate_reports += 1;
            }
        }

        // Recompute accuracy score in basis points.
        rep.accuracy_bps = if rep.total_reports == 0 {
            10_000
        } else {
            (rep.accurate_reports * 10_000) / rep.total_reports
        };
        rep.last_updated = self.env().get_block_time();

        self.oracle_reputations.set(&source_key, rep);
    }

    fn get_position_or_revert(&self, position_id: u64) -> Position {
        self.positions
            .get(&position_id)
            .unwrap_or_else(|| self.env().revert(VaultError::PositionNotFound))
    }

    fn assert_agent(&self) {
        let agent = self.agent.get_or_revert_with(VaultError::NotAgent);
        if self.env().caller() != agent {
            self.env().revert(VaultError::NotAgent);
        }
    }

    fn assert_owner(&self) {
        let owner = self.owner.get_or_revert_with(VaultError::NotOwner);
        if self.env().caller() != owner {
            self.env().revert(VaultError::NotOwner);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::Deployer;

    #[test]
    fn test_open_position_and_agent_update() {
        let test_env = odra_test::env();
        let agent_account = test_env.get_account(1);

        let mut vault = AutarcaVault::deploy(
            &test_env,
            AutarcaVaultInitArgs {
                agent: agent_account,
                min_collateral_ratio_bps: 15_000,
                accuracy_tolerance_bps: 200,
            },
        );

        let position_id = vault.open_position("rwa-real-estate-001".to_string(), 200_000, 100_000);
        let position = vault.get_position(position_id);
        assert_eq!(position.status, PositionStatus::Healthy);

        test_env.set_caller(agent_account);
        vault.agent_update_valuation(position_id, 110_000, "chainlink-rwa".to_string());
        let updated = vault.get_position(position_id);
        assert_eq!(updated.collateral_value_usd_cents, 110_000);
        assert_eq!(updated.status, PositionStatus::Liquidatable);
        assert_eq!(updated.last_valuation_source, "chainlink-rwa");
    }

    #[test]
    fn test_oracle_reputation_tracking() {
        let test_env = odra_test::env();
        let agent_account = test_env.get_account(1);

        let mut vault = AutarcaVault::deploy(
            &test_env,
            AutarcaVaultInitArgs {
                agent: agent_account,
                min_collateral_ratio_bps: 15_000,
                accuracy_tolerance_bps: 200, // 2%
            },
        );

        let id = vault.open_position("rwa-tbill-001".to_string(), 100_000, 50_000);

        test_env.set_caller(agent_account);

        // First report from "oracle-a": sets value to 100_000 (no prior to compare).
        vault.agent_update_valuation(id, 100_000, "oracle-a".to_string());

        // Second report from "oracle-a": drift 1% (within 2% tolerance) -> accurate.
        vault.agent_update_valuation(id, 101_000, "oracle-a".to_string());

        // Third report from "oracle-a": drift 5% (outside tolerance) -> inaccurate.
        vault.agent_update_valuation(id, 106_050, "oracle-a".to_string());

        let rep = vault.get_oracle_reputation("oracle-a".to_string());
        // total_reports counts the *previous* source's reports: report #2
        // scores "oracle-a" against its own prior (100_000 vs 101_000 = 1%,
        // accurate). report #3 scores 101_000 vs 106_050 = 5%, inaccurate.
        // So 1 accurate out of 2 scored reports = 5000 bps.
        assert_eq!(rep.total_reports, 2);
        assert_eq!(rep.accurate_reports, 1);
        assert_eq!(rep.accuracy_bps, 5_000);
    }
}
