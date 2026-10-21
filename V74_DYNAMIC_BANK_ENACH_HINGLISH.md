# V74 — Dynamic Bank eNACH options + test report
- Removed hard-coded HDFC eNACH option from Loan Summary Task dropdown.
- Dropdown now loads active Bank master records (`master_key=bank`) and displays each as `<Bank Name> eNACH Registration`; adding/activating a bank in Master > Bank makes it appear.
- Selecting a bank identifies the chosen bank and states that a live mandate requires a configured provider integration; this UI selection does not falsely claim a mandate was created.
- ZIP integrity checked.
- Frontend production build / Django tests status is recorded separately in TEST_RESULTS_V74.txt.
