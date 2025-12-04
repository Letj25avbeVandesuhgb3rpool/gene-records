// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GeneEditingRecordsFHE is SepoliaConfig {

    struct EncryptedExperiment {
        uint256 id;
        euint32 encryptedGRNA;       // Encrypted gRNA sequence
        euint32 encryptedEfficiency; // Encrypted editing efficiency
        euint32 encryptedNotes;      // Encrypted experiment notes
        uint256 timestamp;
    }

    struct DecryptedExperiment {
        string gRNA;
        string efficiency;
        string notes;
        bool isRevealed;
    }

    uint256 public experimentCount;
    mapping(uint256 => EncryptedExperiment) public encryptedExperiments;
    mapping(uint256 => DecryptedExperiment) public decryptedExperiments;

    mapping(string => euint32) private encryptedMetricCounts;
    string[] private metricList;

    mapping(uint256 => uint256) private requestToExperimentId;

    event ExperimentSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event ExperimentDecrypted(uint256 indexed id);

    modifier onlyResearcher(uint256 experimentId) {
        _;
    }

    function submitEncryptedExperiment(
        euint32 encryptedGRNA,
        euint32 encryptedEfficiency,
        euint32 encryptedNotes
    ) public {
        experimentCount += 1;
        uint256 newId = experimentCount;

        encryptedExperiments[newId] = EncryptedExperiment({
            id: newId,
            encryptedGRNA: encryptedGRNA,
            encryptedEfficiency: encryptedEfficiency,
            encryptedNotes: encryptedNotes,
            timestamp: block.timestamp
        });

        decryptedExperiments[newId] = DecryptedExperiment({
            gRNA: "",
            efficiency: "",
            notes: "",
            isRevealed: false
        });

        emit ExperimentSubmitted(newId, block.timestamp);
    }

    function requestExperimentDecryption(uint256 experimentId) public onlyResearcher(experimentId) {
        EncryptedExperiment storage exp = encryptedExperiments[experimentId];
        require(!decryptedExperiments[experimentId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(exp.encryptedGRNA);
        ciphertexts[1] = FHE.toBytes32(exp.encryptedEfficiency);
        ciphertexts[2] = FHE.toBytes32(exp.encryptedNotes);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptExperiment.selector);
        requestToExperimentId[reqId] = experimentId;

        emit DecryptionRequested(experimentId);
    }

    function decryptExperiment(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 experimentId = requestToExperimentId[requestId];
        require(experimentId != 0, "Invalid request");

        EncryptedExperiment storage eExp = encryptedExperiments[experimentId];
        DecryptedExperiment storage dExp = decryptedExperiments[experimentId];
        require(!dExp.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dExp.gRNA = results[0];
        dExp.efficiency = results[1];
        dExp.notes = results[2];
        dExp.isRevealed = true;

        if (!FHE.isInitialized(encryptedMetricCounts[dExp.efficiency])) {
            encryptedMetricCounts[dExp.efficiency] = FHE.asEuint32(0);
            metricList.push(dExp.efficiency);
        }
        encryptedMetricCounts[dExp.efficiency] = FHE.add(
            encryptedMetricCounts[dExp.efficiency],
            FHE.asEuint32(1)
        );

        emit ExperimentDecrypted(experimentId);
    }

    function getDecryptedExperiment(uint256 experimentId) public view returns (
        string memory gRNA,
        string memory efficiency,
        string memory notes,
        bool isRevealed
    ) {
        DecryptedExperiment storage exp = decryptedExperiments[experimentId];
        return (exp.gRNA, exp.efficiency, exp.notes, exp.isRevealed);
    }

    function getEncryptedMetricCount(string memory metric) public view returns (euint32) {
        return encryptedMetricCounts[metric];
    }

    function requestMetricCountDecryption(string memory metric) public {
        euint32 count = encryptedMetricCounts[metric];
        require(FHE.isInitialized(count), "Metric not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMetricCount.selector);
        requestToExperimentId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(metric)));
    }

    function decryptMetricCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 metricHash = requestToExperimentId[requestId];
        string memory metric = getMetricFromHash(metricHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getMetricFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < metricList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(metricList[i]))) == hash) {
                return metricList[i];
            }
        }
        revert("Metric not found");
    }
}