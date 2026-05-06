// app/store/slices/vehicleSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { vehicleAPI, GarageVehicle } from '../../services/api';

interface VehicleState {
  vehicles: GarageVehicle[];
  loading: boolean;
  error: string | null;
  selectedVehicleId: string | null; // for active journey selection
}

const initialState: VehicleState = {
  vehicles: [],
  loading: false,
  error: null,
  selectedVehicleId: null,
};

// Thunks
export const fetchVehicles = createAsyncThunk('vehicles/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const res = await vehicleAPI.list();
    return res.vehicles;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? 'Failed to load vehicles');
  }
});

export const createVehicle = createAsyncThunk(
  'vehicles/create',
  async (data: Parameters<typeof vehicleAPI.create>[0], { rejectWithValue }) => {
    try {
      const res = await vehicleAPI.create(data);
      return res.vehicle;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Failed to create vehicle');
    }
  }
);

export const updateVehicle = createAsyncThunk(
  'vehicles/update',
  async ({ id, data }: { id: string; data: Parameters<typeof vehicleAPI.update>[1] }, { rejectWithValue }) => {
    try {
      const res = await vehicleAPI.update(id, data);
      return res.vehicle;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Failed to update vehicle');
    }
  }
);

export const deleteVehicle = createAsyncThunk(
  'vehicles/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await vehicleAPI.delete(id);
      return id;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Failed to delete vehicle');
    }
  }
);

export const setDefaultVehicle = createAsyncThunk(
  'vehicles/setDefault',
  async (id: string, { rejectWithValue }) => {
    try {
      const res = await vehicleAPI.setDefault(id);
      return res.vehicle;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Failed to set default');
    }
  }
);

export const uploadVehiclePhoto = createAsyncThunk(
  'vehicles/uploadPhoto',
  async ({ id, uri }: { id: string; uri: string }, { rejectWithValue }) => {
    try {
      const res = await vehicleAPI.uploadPhoto(id, uri);
      return res.vehicle;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? 'Failed to upload photo');
    }
  }
);

const vehicleSlice = createSlice({
  name: 'vehicles',
  initialState,
  reducers: {
    selectVehicleForJourney: (state, action: PayloadAction<string | null>) => {
      state.selectedVehicleId = action.payload;
    },
    clearVehicleError: (state) => {
      state.error = null;
    },
    // Called on logout to wipe local state
    resetVehicles: () => initialState,
  },
  extraReducers: (builder) => {
    // fetchVehicles
    builder
      .addCase(fetchVehicles.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchVehicles.fulfilled, (state, action) => {
        state.loading = false;
        state.vehicles = action.payload;
        // Auto-select default vehicle if nothing selected yet
        if (!state.selectedVehicleId) {
          const def = action.payload.find(v => v.isDefault);
          if (def) state.selectedVehicleId = def.id;
        }
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // createVehicle
    builder
      .addCase(createVehicle.fulfilled, (state, action) => {
        if (action.payload.isDefault) {
          state.vehicles = state.vehicles.map(v => ({ ...v, isDefault: false }));
        }
        state.vehicles.unshift(action.payload);
        if (action.payload.isDefault) state.selectedVehicleId = action.payload.id;
      });

    // updateVehicle
    builder
      .addCase(updateVehicle.fulfilled, (state, action) => {
        if (action.payload.isDefault) {
          state.vehicles = state.vehicles.map(v => ({ ...v, isDefault: false }));
        }
        const idx = state.vehicles.findIndex(v => v.id === action.payload.id);
        if (idx !== -1) state.vehicles[idx] = action.payload;
      });

    // deleteVehicle
    builder
      .addCase(deleteVehicle.fulfilled, (state, action) => {
        state.vehicles = state.vehicles.filter(v => v.id !== action.payload);
        if (state.selectedVehicleId === action.payload) {
          const def = state.vehicles.find(v => v.isDefault);
          state.selectedVehicleId = def?.id ?? null;
        }
      });

    // setDefaultVehicle
    builder
      .addCase(setDefaultVehicle.fulfilled, (state, action) => {
        state.vehicles = state.vehicles.map(v => ({
          ...v,
          isDefault: v.id === action.payload.id,
        }));
        state.selectedVehicleId = action.payload.id;
      });

    // uploadVehiclePhoto
    builder
      .addCase(uploadVehiclePhoto.fulfilled, (state, action) => {
        const idx = state.vehicles.findIndex(v => v.id === action.payload.id);
        if (idx !== -1) state.vehicles[idx] = action.payload;
      });
  },
});

export const { selectVehicleForJourney, clearVehicleError, resetVehicles } = vehicleSlice.actions;
export default vehicleSlice.reducer;

// Selectors
export const selectVehicles = (state: { vehicles: VehicleState }) => state.vehicles.vehicles;
export const selectDefaultVehicle = (state: { vehicles: VehicleState }) =>
  state.vehicles.vehicles.find(v => v.isDefault) ?? null;
export const selectSelectedVehicle = (state: { vehicles: VehicleState }) =>
  state.vehicles.vehicles.find(v => v.id === state.vehicles.selectedVehicleId) ?? null;
export const selectVehiclesLoading = (state: { vehicles: VehicleState }) => state.vehicles.loading;
