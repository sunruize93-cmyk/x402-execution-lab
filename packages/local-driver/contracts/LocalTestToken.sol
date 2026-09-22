// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Local fixture ONLY. Not production USDC, not audited, no market value.
contract LocalTestToken {
    string public constant name = "Local Test Token";
    string public constant symbol = "LOCAL";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    event Transfer(address indexed from, address indexed to, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor(address payer) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes(name)), keccak256("1"), block.chainid, address(this)));
        balanceOf[payer] = 1_000_000_000;
        emit Transfer(address(0), payer, 1_000_000_000);
    }

    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        _transfer(from, to, value, validAfter, validBefore, nonce, v, r, s);
    }

    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external {
        require(signature.length == 65, "signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
        _transfer(from, to, value, validAfter, validBefore, nonce, v, r, s);
    }

    function _transfer(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) internal {
        require(block.timestamp > validAfter && block.timestamp < validBefore, "authorization time");
        require(!authorizationState[from][nonce], "authorization used");
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 && (v == 27 || v == 28), "signature malleability");
        bytes32 structHash = keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        address signer = ecrecover(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)), v, r, s);
        require(signer != address(0) && signer == from, "signature");
        require(balanceOf[from] >= value, "balance");
        authorizationState[from][nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit AuthorizationUsed(from, nonce);
        emit Transfer(from, to, value);
    }

    /// @notice Fixture cancellation uses the original author's on-chain transaction.
    function cancel(bytes32 nonce) external {
        require(!authorizationState[msg.sender][nonce], "authorization used");
        authorizationState[msg.sender][nonce] = true;
        emit AuthorizationCanceled(msg.sender, nonce);
    }
}
