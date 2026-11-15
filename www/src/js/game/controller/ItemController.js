export class ItemController {
    constructor(main) {
        this.main = main;
    }

    getItems() {
        return this.main.player.items;
    }

    getAllPokemon() {
        return [...this.main.team.pokemon, ...this.main.box.pokemon];
    }

    hasItem(id) {
        return this.main.player.items.some(item => item.id === id);
    }

    getItemPosition(id) {
        if (!id) return -1;
        return this.getItems().findIndex(item => item.id === id);
    }

    getAvailablePokemon(item) {
        if (!item) return [];
        return this.getAllPokemon().filter(pokemon =>
            this.canEquip(item, pokemon)
        );
    }

    equip(item, pokemon) {
        if (!this.canEquip(item, pokemon)) return false;
        pokemon.equipItem(item);
        return true;
    }

    isEquipped(item) {
        return typeof item?.equipedBy === 'number';
    }

    canEquip(item, pokemon) {
        if (!pokemon) return false;

        let targetPokemon = pokemon;

        if (item?.megaStone) {
            const baseSpecie = pokemon.isMega ? pokemon.baseSpecie : pokemon.specie;
            const megaSpecie = baseSpecie?.mega?.[item.megaPos];

            if (pokemon.isMega) {
                if (!megaSpecie || megaSpecie !== pokemon.specie.key) return false;

                targetPokemon = Object.assign(Object.create(pokemon), {
                    specie: baseSpecie,
                    ability: baseSpecie.ability,
                    tiles: baseSpecie.tiles,
                    attackType: baseSpecie.attackType,
                    rangeType: baseSpecie.rangeType
                });
            }
        }

        const handlers = {
            key: (value) =>
                value.includes(targetPokemon.specie.key),

            id: (value) =>
                value.includes(targetPokemon.id),

            ability: (value) =>
                value.includes(targetPokemon.ability.id),

            ricochet: (value) =>
                targetPokemon.ricochet > 0,

            orbital: (value) =>
                targetPokemon.orbital > 0,

            tile: (value) =>
                value.some(t => targetPokemon.tiles.includes(t)),

            attackType: (value) =>
                value.includes(targetPokemon.attackType),

            rangeType: (value) =>
                value.includes(targetPokemon.rangeType),

            level: (value) =>
                this.main?.area?.inChallenge?.lvlCap == 50
                ? false
                : this.main?.area?.inChallenge?.lvlCap == 75
                    ? true
                    : value < targetPokemon.lvl
        };

        if (item?.restriction) {
            const hasForbiddenTrait = Object.entries(item.restriction).some(([key, value]) => {
                return handlers[key]?.(value, targetPokemon);
            });
            if (hasForbiddenTrait) return false;
        }

        if (item?.condition) {
            const meetsRequirement = Object.entries(item.condition).some(([key, value]) => {
                return handlers[key]?.(value, targetPokemon);
            });
            if (!meetsRequirement) return false;
        }

        return true;
    }
}
