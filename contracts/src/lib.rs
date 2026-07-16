//! Autarca RWA Collateral Vault
//!
//! An Odra smart contract representing a single tokenized Real-World Asset (RWA)
//! used as DeFi collateral on the Casper Network. The contract state is
//! designed to be read via a Casper MCP Server by off-chain AI agents, and
//! updated autonomously by the Autarca Execution Agent via CSPR.click.

use odra::prelude::*;
use odra::Var;
use odra::Mapping;

/// Status of a collateral position, driven by the autonomous agent pipeline.
#[odra::odra_type]
#[derive(Debug, PartialEq, Eq, Clone)]
pub enum PositionStatus {
    Healthy,
    Warning,
    Liquidatable,
    Liquidated,
}

/// A single RWA-backed collateral position.
#[odra::odra_type]
#[derive(Debug, Clone)]
pub struct Position {
    pub owner: Address,
    pub rwa_id: String,
    pub collateral_value_usd_cents: u64,
    pub debt_value_usd_cents: u64,
    pub last_valuation_timestamp: u64,
    pub status: PositionStatus,
    pub agent_updates: u64,
}

/// Errors returned by the Autarca Vault contract.
#[odra::odra_error]
pub enum VaultError {
    NotOwner = 1,
    NotAgent = 2,
    PositionNotFound = 3,
    InvalidValuation = 4,
    AlreadyLiquidated = 5,
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
}

#[odra::module]
impl AutarcaVault {
    /// Initializes the vault with the deployer as owner and initial agent address.
    pub fn init(&mut self, agent: Address, min_collateral_ratio_bps: u64) {
        self.owner.set(self.env().caller());
        self.agent.set(agent);
        self.min_collateral_ratio_bps.set(min_collateral_ratio_bps);
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
    ) {
        self.assert_agent();
        let mut position = self.get_position_or_revert(position_id);

        position.collateral_value_usd_cents = new_collateral_value_usd_cents;
        position.last_valuation_timestamp = self.env().get_block_time();
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
    use odra::host::{Deployer, HostRef};

    #[test]
    fn test_open_position_and_agent_update() {
        let test_env = odra_test::env();
        let agent_account = test_env.get_account(1);

        let mut vault = AutarcaVaultHostRef::deploy(
            &test_env,
            AutarcaVaultInitArgs {
                agent: agent_account,
                min_collateral_ratio_bps: 15_000,
            },
        );

        let position_id = vault.open_position("rwa-real-estate-001".to_string(), 200_000, 100_000);
        let position = vault.get_position(position_id);
        assert_eq!(position.status, PositionStatus::Healthy);

        test_env.set_caller(agent_account);
        vault.agent_update_valuation(position_id, 110_000);
        let updated = vault.get_position(position_id);
        assert_eq!(updated.collateral_value_usd_cents, 110_000);
        assert_eq!(updated.status, PositionStatus::Liquidatable);
    }
}
