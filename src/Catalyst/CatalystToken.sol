pragma solidity 0.6.5;
pragma experimental ABIEncoderV2;

import "../Interfaces/ERC20Extended.sol";


interface CatalystToken is ERC20Extended {
    struct Gem {
        uint64 blockNumber;
        uint32 id;
    }

    struct Attribute {
        uint32 gemId;
        uint64 blockNumber;
        uint32 slotIndex;
        uint16 minValue;
        uint16 maxValue;
    }

    function getAttributes(Gem[] calldata) external view returns (Attribute[] memory);

    function getMintData()
        external
        view
        returns (
            uint8 rarity,
            uint16 maxGems,
            uint16 minQuantity,
            uint16 maxQuantity
        );
}