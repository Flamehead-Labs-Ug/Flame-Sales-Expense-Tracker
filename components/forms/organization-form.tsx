'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DialogFooter } from '@/components/ui/dialog';

interface Organization {
  id: number;
  name: string;
  country_code?: string | null;
  currency_code?: string | null;
  currency_symbol?: string | null;
}

interface CountryOption {
  code: string;
  name: string;
  currency_code: string | null;
}

interface OrganizationFormProps {
  editingOrganization?: Organization | null;
  onSuccess: (organization: Organization) => void;
  onCancel?: () => void;
}

export function OrganizationForm({ editingOrganization, onSuccess, onCancel }: OrganizationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    countryCode: '',
    currencyCode: '',
    currencySymbol: '',
  });
  const [currencyOptions, setCurrencyOptions] = useState<{ code: string; name: string }[]>([]);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingOrganization) {
      setFormData({
        name: editingOrganization.name,
        countryCode:
          (editingOrganization as any).countryCode ||
          editingOrganization.country_code ||
          '',
        currencyCode:
          (editingOrganization as any).currencyCode ||
          editingOrganization.currency_code ||
          '',
        currencySymbol:
          (editingOrganization as any).currencySymbol ||
          editingOrganization.currency_symbol ||
          '',
      });
    } else {
      setFormData({ name: '', countryCode: '', currencyCode: '', currencySymbol: '' });
    }
  }, [editingOrganization]);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await fetch('/api/countries');
        const data = await response.json();
        if (data.status === 'success') {
          setCountryOptions(data.countries || []);
        }
      } catch {
      }
    };

    loadCountries();
  }, []);

  useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const response = await fetch('/api/currencies');
        const data = await response.json();
        if (data.status === 'success') {
          setCurrencyOptions(data.currencies || []);
        }
      } catch {
        // silently ignore; user can still type currency manually if needed
      }
    };

    loadCurrencies();
  }, []);

  useEffect(() => {
    if (formData.countryCode && countryOptions.length > 0 && !countrySearch) {
      const country = countryOptions.find((c) => c.code === formData.countryCode);
      if (country) {
        setCountrySearch(country.name);
      }
    }
  }, [formData.countryCode, countryOptions, countrySearch]);

  useEffect(() => {
    if (formData.currencyCode && currencyOptions.length > 0 && !currencySearch) {
      const currency = currencyOptions.find((c) => c.code === formData.currencyCode);
      if (currency) {
        setCurrencySearch(`${currency.code} - ${currency.name}`);
      }
    }
  }, [formData.currencyCode, currencyOptions, currencySearch]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCountryInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCountrySearch(value);
    setShowCountryDropdown(true);
  };

  const handleCurrencyInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrencySearch(value);
    setShowCurrencyDropdown(true);
  };

  const handleSelectCountry = (country: CountryOption) => {
    setFormData((prev) => ({
      ...prev,
      countryCode: country.code,
      currencyCode: country.currency_code || prev.currencyCode,
      currencySymbol: prev.currencySymbol,
    }));
    setCountrySearch(country.name);
    setShowCountryDropdown(false);

    if (country.currency_code) {
      const matchedCurrency = currencyOptions.find((c) => c.code === country.currency_code);
      if (matchedCurrency) {
        setCurrencySearch(`${matchedCurrency.code} - ${matchedCurrency.name}`);
      }
    }
  };

  const handleSelectCurrency = (currency: { code: string; name: string }) => {
    setFormData((prev) => ({ ...prev, currencyCode: currency.code }));
    setCurrencySearch(`${currency.code} - ${currency.name}`);
    setShowCurrencyDropdown(false);
  };

  const filteredCountries = countryOptions.filter((country) => {
    if (!countrySearch.trim()) return true;
    const query = countrySearch.toLowerCase();
    return (
      country.name.toLowerCase().includes(query) ||
      country.code.toLowerCase().includes(query)
    );
  });

  const filteredCurrencies = currencyOptions.filter((currency) => {
    if (!currencySearch.trim()) return true;
    const query = currencySearch.toLowerCase();
    return (
      currency.code.toLowerCase().includes(query) ||
      (currency.name || '').toLowerCase().includes(query)
    );
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch('/api/organizations', {
        method: editingOrganization ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingOrganization
            ? { ...formData, id: editingOrganization.id }
            : formData,
        ),
      });
      const data = await response.json();
      if (data.status === 'success') {
        toast.success(`Organization ${editingOrganization ? 'updated' : 'created'} successfully`);
        onSuccess(data.organization);
      } else {
        toast.error(data.message || 'Failed to save organization');
      }
    } catch (error) {
      toast.error('Failed to save organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground">Organization Name *</label>
        <Input
          name="name"
          placeholder="Enter your organization name"
          value={formData.name}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">Country</label>
          <div className="mt-1 relative">
            <Input
              name="countrySearch"
              placeholder="Search country"
              value={countrySearch}
              onChange={handleCountryInputChange}
              onFocus={() => setShowCountryDropdown(true)}
            />
            {showCountryDropdown && filteredCountries.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow max-h-40 overflow-y-auto">
                {filteredCountries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelectCountry(country)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                  >
                    <div className="font-medium">{country.name}</div>
                    <div className="text-xs text-muted-foreground">{country.code}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground">Currency</label>
          <div className="mt-1 relative">
            <Input
              name="currencySearch"
              placeholder="Search currency"
              value={currencySearch}
              onChange={handleCurrencyInputChange}
              onFocus={() => setShowCurrencyDropdown(true)}
            />
            {showCurrencyDropdown && filteredCurrencies.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-popover border border-border rounded-md shadow max-h-40 overflow-y-auto">
                {filteredCurrencies.map((currency) => (
                  <button
                    key={currency.code}
                    type="button"
                    onClick={() => handleSelectCurrency(currency)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                  >
                    <div className="font-medium">{currency.code}</div>
                    <div className="text-xs text-muted-foreground">{currency.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <DialogFooter className='pt-4'>
        {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
            </Button>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {editingOrganization ? 'Update Organization' : 'Create Organization'}
        </Button>
      </DialogFooter>
    </form>
  );
}
