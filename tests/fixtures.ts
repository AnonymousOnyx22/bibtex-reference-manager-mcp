export const BIBTEX = `@string{jml = "Journal of Machine Learning"}
@comment{ignored}
@article{smith2024deep,
  author = {Smith, John and Maria van der Berg},
  title = {Deep learning for {DNA} sequencing},
  journal = jml,
  year = 2024,
  volume = {12},
  number = {3},
  pages = {45-60},
  doi = {https://doi.org/10.1000/abc123},
}

@book{knuth1984,
  author = "Donald E. Knuth",
  title = {The {TeX}book},
  publisher = {Addison-Wesley},
  year = {1984}
}
`;

export const RIS = `TY  - JOUR
ID  - lee2023
AU  - Lee, Anna
AU  - Chen, Wei
TI  - Sleep and memory in students
T2  - Journal of Sleep Research
PY  - 2023/05/01
VL  - 8
IS  - 2
SP  - 100
EP  - 112
DO  - 10.2000/sleep.2023
KW  - sleep
KW  - memory
ER  -

TY  - BOOK
AU  - Brown, Carol
TI  - Study Habits
PB  - Campus Press
PY  - 2020
ER  -
`;

export const CSL = JSON.stringify([
  {
    id: "garcia2022",
    type: "article-journal",
    title: "Remote learning outcomes",
    author: [{ family: "Garcia", given: "Luis" }, { literal: "World Health Organization" }],
    issued: { "date-parts": [[2022, 3]] },
    "container-title": "Education Review",
    volume: "5",
    issue: "1",
    page: "9-18",
    DOI: "10.3000/edu.2022.1",
  },
]);
