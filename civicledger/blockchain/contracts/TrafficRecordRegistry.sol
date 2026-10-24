// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TrafficRecordRegistry
 * @author CivicLedger
 * @notice Manages cryptographic commitments for driving licenses, vehicle insurance,
 *         and traffic violations. Private data stays in MongoDB; only hash commitments
 *         and audit metadata are stored on-chain.
 *
 * @dev Record types: "LICENSE" | "VEHICLE" | "INSURANCE" | "VIOLATION"
 *      Each record stores versioned SHA-256 commitments. Every meaningful update
 *      appends a new version; previous versions remain verifiable.
 */
contract TrafficRecordRegistry is AccessControl, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant LICENSING_AUTHORITY_ROLE = keccak256("LICENSING_AUTHORITY_ROLE");
    bytes32 public constant INSURANCE_COMPANY_ROLE   = keccak256("INSURANCE_COMPANY_ROLE");
    bytes32 public constant TRAFFIC_POLICE_ROLE      = keccak256("TRAFFIC_POLICE_ROLE");

    // ─────────────────────────────────────────────────────────
    // Data structures
    // ─────────────────────────────────────────────────────────

    struct CommitmentVersion {
        bytes32 commitment;   // SHA-256 hash of the canonical record serialization
        uint256 timestamp;    // Block timestamp at commit time
        address actor;        // Who performed the operation
        string  action;       // Human-readable action label e.g. "ISSUED", "RENEWED"
    }

    struct Record {
        string  recordType;              // "LICENSE" | "VEHICLE" | "INSURANCE" | "VIOLATION"
        string  ref;                     // Opaque record reference (e.g. LIC-2024-0001)
        CommitmentVersion[] versions;    // Index 0 = initial; latest = last element
        bool    exists;
    }

    // ─────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────

    // recordRef => Record
    mapping(string => Record) private _records;

    // List of all registered refs for enumeration
    string[] private _allRefs;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event RecordRegistered(
        string indexed ref,
        string recordType,
        bytes32 commitment,
        address indexed actor,
        uint256 timestamp
    );

    event RecordUpdated(
        string indexed ref,
        string recordType,
        bytes32 newCommitment,
        string  action,
        address indexed actor,
        uint256 versionIndex,
        uint256 timestamp
    );

    event RoleGrantedCivic(
        bytes32 indexed role,
        address indexed account,
        address indexed grantor
    );

    event RoleRevokedCivic(
        bytes32 indexed role,
        address indexed account,
        address indexed revoker
    );

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor(address admin) {
        require(admin != address(0), "Admin cannot be zero address");
        _grantRole(ADMIN_ROLE, admin);
    }

    // ─────────────────────────────────────────────────────────
    // Role management
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Grant a civic role to an account.
     * @dev Only callable by admin.
     */
    function grantCivicRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        require(account != address(0), "Cannot grant to zero address");
        require(
            role == LICENSING_AUTHORITY_ROLE ||
            role == INSURANCE_COMPANY_ROLE   ||
            role == TRAFFIC_POLICE_ROLE,
            "Unknown civic role"
        );
        _grantRole(role, account);
        emit RoleGrantedCivic(role, account, msg.sender);
    }

    /**
     * @notice Revoke a civic role from an account.
     * @dev Only callable by admin.
     */
    function revokeCivicRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        require(
            role == LICENSING_AUTHORITY_ROLE ||
            role == INSURANCE_COMPANY_ROLE   ||
            role == TRAFFIC_POLICE_ROLE,
            "Unknown civic role"
        );
        _revokeRole(role, account);
        emit RoleRevokedCivic(role, account, msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    // Record registration
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Register a new LICENSE commitment.
     * @param ref        Unique record reference (e.g. "LIC-2024-0001")
     * @param commitment SHA-256 hash of the canonical license document
     * @param action     Initial action label (e.g. "ISSUED")
     */
    function registerLicense(
        string calldata ref,
        bytes32 commitment,
        string  calldata action
    ) external onlyRole(LICENSING_AUTHORITY_ROLE) nonReentrant {
        _registerRecord("LICENSE", ref, commitment, action);
    }

    /**
     * @notice Register a new VEHICLE commitment.
     */
    function registerVehicle(
        string calldata ref,
        bytes32 commitment,
        string  calldata action
    ) external nonReentrant {
        require(
            hasRole(LICENSING_AUTHORITY_ROLE, msg.sender) ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized to register vehicles"
        );
        _registerRecord("VEHICLE", ref, commitment, action);
    }

    /**
     * @notice Register a new INSURANCE commitment.
     */
    function registerInsurance(
        string calldata ref,
        bytes32 commitment,
        string  calldata action
    ) external onlyRole(INSURANCE_COMPANY_ROLE) nonReentrant {
        _registerRecord("INSURANCE", ref, commitment, action);
    }

    /**
     * @notice Register a new VIOLATION commitment.
     */
    function registerViolation(
        string calldata ref,
        bytes32 commitment,
        string  calldata action
    ) external onlyRole(TRAFFIC_POLICE_ROLE) nonReentrant {
        _registerRecord("VIOLATION", ref, commitment, action);
    }

    // ─────────────────────────────────────────────────────────
    // Record updates (new version)
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Append a new version commitment for a LICENSE record.
     */
    function updateLicense(
        string calldata ref,
        bytes32 newCommitment,
        string  calldata action
    ) external onlyRole(LICENSING_AUTHORITY_ROLE) nonReentrant {
        _updateRecord(ref, newCommitment, action);
    }

    /**
     * @notice Append a new version commitment for an INSURANCE record.
     */
    function updateInsurance(
        string calldata ref,
        bytes32 newCommitment,
        string  calldata action
    ) external onlyRole(INSURANCE_COMPANY_ROLE) nonReentrant {
        _updateRecord(ref, newCommitment, action);
    }

    /**
     * @notice Append a new version commitment for a VIOLATION record.
     */
    function updateViolation(
        string calldata ref,
        bytes32 newCommitment,
        string  calldata action
    ) external onlyRole(TRAFFIC_POLICE_ROLE) nonReentrant {
        _updateRecord(ref, newCommitment, action);
    }

    /**
     * @notice Admin-level update for any record type (e.g. corrections).
     */
    function adminUpdateRecord(
        string calldata ref,
        bytes32 newCommitment,
        string  calldata action
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        _updateRecord(ref, newCommitment, action);
    }

    // ─────────────────────────────────────────────────────────
    // Verification
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Returns the latest committed version index and commitment.
     */
    function getLatestCommitment(string calldata ref)
        external view
        returns (
            uint256 versionIndex,
            bytes32 commitment,
            uint256 timestamp,
            address actor,
            string memory action
        )
    {
        require(_records[ref].exists, "Record not found");
        Record storage rec = _records[ref];
        uint256 idx = rec.versions.length - 1;
        CommitmentVersion storage cv = rec.versions[idx];
        return (idx, cv.commitment, cv.timestamp, cv.actor, cv.action);
    }

    /**
     * @notice Returns a specific version's commitment data.
     */
    function getVersionCommitment(string calldata ref, uint256 versionIndex)
        external view
        returns (
            bytes32 commitment,
            uint256 timestamp,
            address actor,
            string memory action
        )
    {
        require(_records[ref].exists, "Record not found");
        Record storage rec = _records[ref];
        require(versionIndex < rec.versions.length, "Version does not exist");
        CommitmentVersion storage cv = rec.versions[versionIndex];
        return (cv.commitment, cv.timestamp, cv.actor, cv.action);
    }

    /**
     * @notice Returns the total number of versions for a record.
     */
    function getVersionCount(string calldata ref) external view returns (uint256) {
        require(_records[ref].exists, "Record not found");
        return _records[ref].versions.length;
    }

    /**
     * @notice Returns the record type for a reference.
     */
    function getRecordType(string calldata ref) external view returns (string memory) {
        require(_records[ref].exists, "Record not found");
        return _records[ref].recordType;
    }

    /**
     * @notice Checks whether a record reference exists.
     */
    function recordExists(string calldata ref) external view returns (bool) {
        return _records[ref].exists;
    }

    /**
     * @notice Returns the total number of registered records.
     */
    function getTotalRecords() external view returns (uint256) {
        return _allRefs.length;
    }

    // ─────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────

    function _registerRecord(
        string memory recordType,
        string calldata ref,
        bytes32 commitment,
        string  calldata action
    ) internal {
        require(bytes(ref).length > 0,        "Ref cannot be empty");
        require(bytes(ref).length <= 64,       "Ref too long");
        require(commitment != bytes32(0),      "Commitment cannot be zero");
        require(bytes(action).length > 0,      "Action cannot be empty");
        require(!_records[ref].exists,         "Record already registered");

        Record storage rec = _records[ref];
        rec.recordType = recordType;
        rec.ref        = ref;
        rec.exists     = true;

        rec.versions.push(CommitmentVersion({
            commitment: commitment,
            timestamp:  block.timestamp,
            actor:      msg.sender,
            action:     action
        }));

        _allRefs.push(ref);

        emit RecordRegistered(ref, recordType, commitment, msg.sender, block.timestamp);
    }

    function _updateRecord(
        string calldata ref,
        bytes32 newCommitment,
        string  calldata action
    ) internal {
        require(_records[ref].exists,          "Record not found");
        require(newCommitment != bytes32(0),   "Commitment cannot be zero");
        require(bytes(action).length > 0,      "Action cannot be empty");

        Record storage rec = _records[ref];
        uint256 newIdx = rec.versions.length;

        rec.versions.push(CommitmentVersion({
            commitment: newCommitment,
            timestamp:  block.timestamp,
            actor:      msg.sender,
            action:     action
        }));

        emit RecordUpdated(ref, rec.recordType, newCommitment, action, msg.sender, newIdx, block.timestamp);
    }
}
