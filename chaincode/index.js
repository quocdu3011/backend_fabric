'use strict';

/**
 * Chaincode Entry Point
 * 
 * This file exports the DegreeContract for Hyperledger Fabric to load.
 * The contract handles degree issuance and transcript management.
 */

const DegreeContract = require('./lib/degree-contract');

module.exports.DegreeContract = DegreeContract;
module.exports.contracts = [DegreeContract];
