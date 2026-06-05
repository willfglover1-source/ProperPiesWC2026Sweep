export function generateMatches(groups) {
    const matches = [];
    let matchCounter = 0;

    groups.forEach(group => {
        const teams = group.teams;
        for (let i = 0; i < teams.length; i++) {
            for (let j = i + 1; j < teams.length; j++) {
                matchCounter++;
                matches.push({
                    id: `${group.id}-${matchCounter}`,
                    groupId: group.id,
                    home: teams[i],
                    away: teams[j],
                    date: "TBD"
                });
            }
        }
    });

    return matches;
}
