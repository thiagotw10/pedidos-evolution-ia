import React,{useEffect,useRef,useState} from 'react';
import {formatVehiclePrice,parseVehiclePrice} from '../utils/vehiclePrice';
export function VehiclePriceInput({value,onChange,disabled}:{value:number;onChange:(value:number)=>void;disabled:boolean}){
 const [text,setText]=useState(()=>formatVehiclePrice(value)),[error,setError]=useState('');const focused=useRef(false),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!focused.current){setText(formatVehiclePrice(value));setError('');input.current?.setCustomValidity('');}},[value]);
 function change(raw:string){setText(raw);const price=parseVehiclePrice(raw);const message=price===null?'Informe um valor válido, como 150.000,00.':'';setError(message);input.current?.setCustomValidity(message);if(price!==null)onChange(price);}
 return <><div className="vehicle-price-field"><span aria-hidden="true">R$</span><input ref={input} aria-label="Preço do veículo em reais" aria-describedby="vehicle-price-help" aria-invalid={!!error} type="text" inputMode="decimal" autoComplete="off" placeholder="Ex.: 150.000,00" value={text} disabled={disabled} onFocus={event=>{focused.current=true;event.currentTarget.select();}} onChange={e=>change(e.target.value)} onBlur={()=>{focused.current=false;const price=parseVehiclePrice(text);if(price!==null)setText(formatVehiclePrice(price));}}/></div><small id="vehicle-price-help" className="vehicle-price-help">{error||'Digite 150000 para R$ 150.000,00. Deixe vazio ou zero para preço sob consulta.'}</small></>;
}
