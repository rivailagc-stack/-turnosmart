module.exports=async(req,res)=>{
  res.status(410).json({
    ok:false,
    disabled:true,
    error:'Leitura OpenAI desativada na V86. O TurnoSmart usa OCR local.'
  });
};
