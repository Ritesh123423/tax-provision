# Income Tax Provision Workpaper

**Professional Tax Provision Calculator for Ind AS 12 Compliance**

K G Somani & Co LLP, Chartered Accountants

---

## Overview

A comprehensive web-based application for computing income tax provisions in compliance with Indian Accounting Standard (Ind AS) 12 - Income Taxes. This tool implements the balance sheet approach for deferred tax calculations and generates complete journal entries and disclosure notes.

## Features

### Core Functionality
- **Current Tax Computation**: Book profit to taxable income reconciliation
- **Deferred Tax Calculation**: Balance sheet approach per Ind AS 12
- **Movement Schedules**: DTA/DTL opening to closing reconciliation
- **Journal Entries**: Auto-generated accounting entries
- **ETR Reconciliation**: Effective vs statutory tax rate analysis
- **Disclosure Notes**: Draft notes for financial statements
- **Quality Control Checklist**: Auditor compliance verification

### Technical Features
- Clean, professional interface
- Real-time calculations
- Client-specific customization
- Print/PDF export capability
- Keyboard shortcuts (Ctrl+Enter to compute)
- Progress tracking
- Data validation

## Usage

### Getting Started
1. Open `index.html` in a modern web browser
2. Navigate through 8 structured steps
3. Enter client and engagement details
4. Input current tax and deferred tax data
5. Click "Compute" to generate results

### Navigation
- **Step 1**: Client & Engagement - Setup client details, tax regime, opening balances
- **Step 2**: Current Tax - Book profit to taxable income adjustments
- **Step 3**: Deferred Tax - Temporary differences for assets, liabilities, and other items
- **Step 4**: Movement Schedule - DTA/DTL reconciliation
- **Step 5**: Summary & Journal Entries - Final provision and accounting entries
- **Step 6**: ETR Reconciliation - Effective tax rate analysis
- **Step 7**: Disclosure Note - Draft note for financial statements
- **Step 8**: QC Checklist - Quality control and compliance review

### Tax Regimes Supported
- New Regime - Section 115BAA (25.168%)
- Old Regime - 30% + surcharge + cess (34.944%)
- Start-up Regime - Section 115BAB (17.014%)
- MAT Applicable - u/s 115JB (17.472%)

## File Structure

```
tax-provision/
├── index.html          # Main application file
├── css/
│   └── style.css      # Professional styling
├── js/
│   ├── compute.js     # Tax calculation engine
│   ├── state.js       # Data management
│   ├── ui.js          # User interface logic
│   └── excel.js       # Export functionality (stub)
└── README.md          # Documentation
```

## Technical Specifications

### Browser Compatibility
- Chrome (recommended)
- Firefox
- Edge
- Safari

### Dependencies
- No external libraries required
- Pure HTML, CSS, JavaScript

### Standards Compliance
- Ind AS 12 - Income Taxes
- Companies Act 2013, Schedule III
- Income Tax Act, 1961
- SA 500 series audit standards

## Professional Notes

### Deferred Tax Approach
This application implements the **balance sheet approach** mandated by Ind AS 12:

**Assets:**
- Carrying Amount > Tax Base = Taxable Temporary Difference → DTL
- Carrying Amount < Tax Base = Deductible Temporary Difference → DTA

**Liabilities:**
- Carrying Amount > Tax Base = Deductible Temporary Difference → DTA
- Carrying Amount < Tax Base = Taxable Temporary Difference → DTL

### Key Features for Professionals
- Virtual certainty test for DTA recognition
- MAT credit entitlement tracking
- Opening balance verification against prior year
- Comprehensive disclosure templates
- Audit trail and sign-off fields

## Keyboard Shortcuts

- `Ctrl + Enter`: Run computation
- `Ctrl + P`: Print/PDF export

## Data Entry Guidelines

1. **Always enter positive numbers** - The system handles signs automatically
2. **Match opening balances** to prior year audited financial statements
3. **Review temporary differences** for all balance sheet items
4. **Verify tax rates** match the selected regime
5. **Document assumptions** in label fields

## Support & Maintenance

For technical support or inquiries:
- K G Somani & Co LLP
- Chartered Accountants

## Version

Current Version: 1.0
Last Updated: 2026

## License

Proprietary - K G Somani & Co LLP
All Rights Reserved

---

**Disclaimer**: This tool is designed to assist in tax provision calculations. Users should exercise professional judgment and verify all computations. The tool does not replace professional advice from qualified chartered accountants or tax consultants.
