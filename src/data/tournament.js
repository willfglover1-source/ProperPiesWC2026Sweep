// Tournament data for the sweep. Verify before using for the real tournament.
export const PLAYERS = [
    { id: "p1", name: "Mik" },
    { id: "p2", name: "Pickle" },
    { id: "p3", name: "Buchy" },
    { id: "p4", name: "Theile" },
    { id: "p5", name: "Curran" },
    { id: "p6", name: "Glover" },
    { id: "p7", name: "Jordy" },
    { id: "p8", name: "Dunc" },
    { id: "p9", name: "Wylie" }
];

// 12 Groups for 2026 World Cup (based on official draw data)
export const GROUPS = [
    {
        id: "A",
        name: "Group A",
        teams: ["Mexico", "South Africa", "Korea Republic", "Czechia"]
    },
    {
        id: "B",
        name: "Group B",
        teams: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"]
    },
    {
        id: "C",
        name: "Group C",
        teams: ["Brazil", "Morocco", "Haiti", "Scotland"]
    },
    {
        id: "D",
        name: "Group D",
        teams: ["United States", "Paraguay", "Australia", "Türkiye"]
    },
    {
        id: "E",
        name: "Group E",
        teams: ["Germany", "Curaçao", "Côte d’Ivoire", "Ecuador"]
    },
    {
        id: "F",
        name: "Group F",
        teams: ["Netherlands", "Japan", "Tunisia", "Sweden"]
    },
    {
        id: "G",
        name: "Group G",
        teams: ["Belgium", "Egypt", "Iran", "New Zealand"]
    },
    {
        id: "H",
        name: "Group H",
        teams: ["Spain", "Cabo Verde", "Saudi Arabia", "Uruguay"]
    },
    {
        id: "I",
        name: "Group I",
        teams: ["Argentina", "Colombia", "Peru", "Jordan"]
    },
    {
        id: "J",
        name: "Group J",
        teams: ["France", "Senegal", "Norway", "Iraq"]
    },
    {
        id: "K",
        name: "Group K",
        teams: ["Portugal", "Austria", "Uzbekistan", "Algeria"]
    },
    {
        id: "L",
        name: "Group L",
        teams: ["England", "Croatia", "Ghana", "Panama"]
    }
];

// Decimal betting odds keyed by "home:away" — [home_win, draw, away_win]
export const ODDS = {
    "Mexico:South Africa": [1.80, 3.50, 4.50],
    "Mexico:Korea Republic": [2.10, 3.30, 3.40],
    "Mexico:Czechia": [2.30, 3.20, 3.10],
    "South Africa:Korea Republic": [3.20, 3.00, 2.30],
    "South Africa:Czechia": [3.40, 3.10, 2.20],
    "Korea Republic:Czechia": [2.80, 3.10, 2.60],
    "Canada:Bosnia and Herzegovina": [2.10, 3.30, 3.50],
    "Canada:Qatar": [1.55, 3.90, 6.50],
    "Canada:Switzerland": [2.80, 3.20, 2.60],
    "Bosnia and Herzegovina:Qatar": [1.80, 3.40, 4.50],
    "Bosnia and Herzegovina:Switzerland": [3.50, 3.30, 2.10],
    "Qatar:Switzerland": [4.50, 3.40, 1.80],
    "Brazil:Morocco": [1.55, 3.90, 6.50],
    "Brazil:Haiti": [1.10, 8.00, 22.00],
    "Brazil:Scotland": [1.30, 5.00, 9.50],
    "Morocco:Haiti": [1.45, 4.00, 7.50],
    "Morocco:Scotland": [2.20, 3.20, 3.40],
    "Haiti:Scotland": [4.50, 3.50, 1.80],
    "United States:Paraguay": [2.00, 3.30, 3.80],
    "United States:Australia": [2.10, 3.20, 3.60],
    "United States:Türkiye": [2.30, 3.30, 3.20],
    "Paraguay:Australia": [2.80, 3.10, 2.60],
    "Paraguay:Türkiye": [2.90, 3.10, 2.50],
    "Australia:Türkiye": [3.20, 3.10, 2.30],
    "Germany:Curaçao": [1.10, 7.00, 20.00],
    "Germany:Côte d'Ivoire": [1.45, 4.50, 7.00],
    "Germany:Ecuador": [1.55, 4.00, 6.50],
    "Curaçao:Côte d'Ivoire": [4.50, 3.50, 1.80],
    "Curaçao:Ecuador": [5.00, 3.80, 1.65],
    "Côte d'Ivoire:Ecuador": [2.80, 3.10, 2.60],
    "Netherlands:Japan": [1.75, 3.60, 5.00],
    "Netherlands:Tunisia": [1.30, 5.50, 9.00],
    "Netherlands:Sweden": [1.85, 3.40, 4.50],
    "Japan:Tunisia": [1.80, 3.40, 4.50],
    "Japan:Sweden": [2.60, 3.20, 2.80],
    "Tunisia:Sweden": [3.80, 3.30, 2.00],
    "Belgium:Egypt": [1.55, 4.00, 6.50],
    "Belgium:Iran": [1.30, 5.00, 9.50],
    "Belgium:New Zealand": [1.20, 6.50, 13.00],
    "Egypt:Iran": [2.40, 3.10, 3.00],
    "Egypt:New Zealand": [1.90, 3.30, 4.20],
    "Iran:New Zealand": [2.30, 3.20, 3.20],
    "Spain:Cabo Verde": [1.10, 7.50, 18.00],
    "Spain:Saudi Arabia": [1.20, 6.00, 14.00],
    "Spain:Uruguay": [1.75, 3.60, 5.00],
    "Cabo Verde:Saudi Arabia": [2.90, 3.10, 2.50],
    "Cabo Verde:Uruguay": [4.50, 3.50, 1.80],
    "Saudi Arabia:Uruguay": [3.80, 3.30, 2.00],
    "Argentina:Colombia": [1.85, 3.50, 4.50],
    "Argentina:Peru": [1.20, 6.00, 14.00],
    "Argentina:Jordan": [1.05, 10.00, 28.00],
    "Colombia:Peru": [1.90, 3.30, 4.20],
    "Colombia:Jordan": [1.20, 6.00, 13.00],
    "Peru:Jordan": [1.80, 3.40, 4.50],
    "France:Senegal": [1.65, 3.80, 5.50],
    "France:Norway": [1.55, 4.00, 6.50],
    "France:Iraq": [1.10, 7.50, 20.00],
    "Senegal:Norway": [3.20, 3.10, 2.30],
    "Senegal:Iraq": [1.55, 4.00, 6.50],
    "Norway:Iraq": [1.45, 4.50, 7.00],
    "Portugal:Austria": [1.75, 3.60, 5.00],
    "Portugal:Uzbekistan": [1.10, 7.50, 18.00],
    "Portugal:Algeria": [1.45, 4.50, 7.00],
    "Austria:Uzbekistan": [1.45, 4.50, 7.00],
    "Austria:Algeria": [2.00, 3.30, 3.80],
    "Uzbekistan:Algeria": [3.20, 3.10, 2.30],
    "England:Croatia": [1.85, 3.50, 4.50],
    "England:Ghana": [1.30, 5.00, 9.50],
    "England:Panama": [1.20, 6.50, 13.00],
    "Croatia:Ghana": [1.90, 3.30, 4.20],
    "Croatia:Panama": [1.55, 4.00, 6.50],
    "Ghana:Panama": [2.20, 3.20, 3.40]
};
